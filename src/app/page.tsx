
'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Mic, Pause, Square, Save, Search, Loader2, AlertTriangle, CheckCircle2, FileText, Trash2, Download, Users, History, Edit3, ListOrdered, Settings, UserCircle, LayoutDashboard, FolderOpen, Edit, MessageSquare, Video, Palette, Landmark, Briefcase, Sigma, CircleHelp, FileAudio, Clock, PlusCircle, ToggleLeft, ToggleRight, Headphones } from 'lucide-react';
import { AppLogo } from '@/components/layout/AppLogo';
import { transcribeAudioAction, searchTranscriptAction, diarizeTranscriptAction } from './actions';
import type { SmartSearchInput, SmartSearchOutput } from '@/ai/flows/smart-search';
import type { DiarizeTranscriptInput, DiarizedSegment } from '@/ai/flows/diarize-transcript-flow';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarInset, SidebarTrigger, SidebarFooter, useSidebar } from '@/components/ui/sidebar';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

type RecordingState = 'idle' | 'recording' | 'paused';
type ActiveView = 'liveSession' | 'recordings' | 'transcriptions' | 'searchCases' | 'settings' | 'userProfile';

interface SavedTranscript {
  id: string;
  timestamp: number;
  title: string;
  rawTranscript: string;
  diarizedTranscript: DiarizedSegment[] | null;
  audioDataUri: string | null;
}

const speakerColors: { [key: string]: string } = {
  DEFAULT: 'text-primary',
  JUDGE: 'text-blue-600 dark:text-blue-400',
  COUNSEL: 'text-red-600 dark:text-red-400',
  WITNESS: 'text-green-600 dark:text-green-400',
  PLAINTIFF: 'text-purple-600 dark:text-purple-400',
  DEFENDANT: 'text-orange-600 dark:text-orange-400',
};

const getSpeakerColor = (speakerIdentifier: string) => {
  const upperIdentifier = speakerIdentifier.toUpperCase();
  for (const role in speakerColors) {
    if (upperIdentifier.includes(role)) {
      return speakerColors[role];
    }
  }
  // Try to assign a consistent color based on "Speaker X"
  const speakerMatch = upperIdentifier.match(/SPEAKER\s*(\d+)/);
  if (speakerMatch) {
    const speakerNum = parseInt(speakerMatch[1], 10);
    const colorKeys = Object.keys(speakerColors).filter(k => k !== 'DEFAULT');
    return speakerColors[colorKeys[speakerNum % colorKeys.length]] || speakerColors.DEFAULT;
  }
  return speakerColors.DEFAULT;
};


export default function CourtProceedingsPage() {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [rawTranscript, setRawTranscript] = useState<string>('');
  const [diarizedTranscript, setDiarizedTranscript] = useState<DiarizedSegment[] | null>(null);
  
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<SmartSearchOutput | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  
  const [isTranscribingChunk, setIsTranscribingChunk] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isDiarizing, setIsDiarizing] = useState<boolean>(false);

  const [savedTranscripts, setSavedTranscripts] = useState<SavedTranscript[]>([]);
  const [currentSessionTitle, setCurrentSessionTitle] = useState<string>('');
  const [showSaveDialog, setShowSaveDialog] = useState<boolean>(false);

  const [currentRecordingFullAudioUri, setCurrentRecordingFullAudioUri] = useState<string | null>(null);
  const [loadedAudioUri, setLoadedAudioUri] = useState<string | null>(null);
  
  const [activeView, setActiveView] = useState<ActiveView>('liveSession');
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [autoTranscription, setAutoTranscription] = useState<boolean>(true);


  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const transcriptScrollAreaRef = useRef<HTMLDivElement>(null);
  const liveSessionScrollRef = useRef<HTMLDivElement>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const { toast } = useToast();
  const { open: sidebarOpen } = useSidebar();

  useEffect(() => {
    const storedTranscripts = localStorage.getItem('naijaLawScribeTranscripts');
    if (storedTranscripts) {
      setSavedTranscripts(JSON.parse(storedTranscripts));
    }
  }, []);

  useEffect(() => {
    if (recordingState === 'recording') {
      timerIntervalRef.current = setInterval(() => {
        setElapsedTime((prevTime) => prevTime + 1);
      }, 1000);
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      if (recordingState === 'idle') {
        setElapsedTime(0);
      }
    }
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [recordingState]);

  const formatTime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours > 0 ? String(hours).padStart(2, '0') + ':' : ''}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const persistSavedTranscripts = (updatedTranscripts: SavedTranscript[]) => {
    setSavedTranscripts(updatedTranscripts);
    localStorage.setItem('naijaLawScribeTranscripts', JSON.stringify(updatedTranscripts));
  };

  const blobToDataURI = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (reader.error) {
          reject(reader.error);
        } else {
          resolve(reader.result as string);
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const handleDiarizeTranscript = useCallback(async (audioUri?: string, transcriptToDiarize?: string) => {
    const audioForDiarization = audioUri || currentRecordingFullAudioUri || loadedAudioUri;
    const currentTranscript = transcriptToDiarize || rawTranscript;

    if (isDiarizing) {
      toast({ title: 'Diarization in Progress', description: 'Please wait for the current diarization to complete.', variant: 'default' });
      return;
    }
    if (!audioForDiarization || !currentTranscript.trim()) {
      if (!currentRecordingFullAudioUri && !loadedAudioUri && activeView === 'liveSession') {
         // Only show if triggered manually and not implicitly
      } else if (activeView !== 'liveSession' || (currentRecordingFullAudioUri || loadedAudioUri)){
         toast({ title: 'Diarization Skipped', description: 'Full audio and raw transcript are required for diarization.', variant: 'default' });
      }
      return;
    }
    setIsDiarizing(true);
    try {
      const input: DiarizeTranscriptInput = { audioDataUri: audioForDiarization, rawTranscript: currentTranscript };
      const response = await diarizeTranscriptAction(input);
      if (response.segments) {
        setDiarizedTranscript(response.segments);
        toast({ title: 'Diarization Complete', description: 'Transcript has been segmented by speaker.', icon: <CheckCircle2 className="h-5 w-5 text-green-500" /> });
      } else if (response.error) {
        toast({ title: 'Diarization Failed', description: response.error, variant: 'destructive' });
        setDiarizedTranscript(null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An unknown error occurred during diarization.';
      toast({ title: 'Diarization Exception', description: message, variant: 'destructive' });
      setDiarizedTranscript(null);
    } finally {
      setIsDiarizing(false);
    }
  }, [isDiarizing, currentRecordingFullAudioUri, loadedAudioUri, rawTranscript, toast, activeView]);


  const handleStartRecording = async () => {
    if (recordingState === 'idle' || recordingState === 'paused') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm' });

        mediaRecorderRef.current.ondataavailable = async (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
            if (autoTranscription) {
              setIsTranscribingChunk(true);
              try {
                const audioBlob = new Blob([event.data], { type: event.data.type || 'audio/webm' });
                const audioDataUri = await blobToDataURI(audioBlob);
                const result = await transcribeAudioAction(audioDataUri);
                if (result.transcription) {
                  setRawTranscript((prev) => prev + result.transcription + ' ');
                } else if (result.error) {
                  toast({ title: 'Transcription Error', description: result.error, variant: 'destructive' });
                }
              } catch (error) {
                console.error("Error converting blob or transcribing:", error);
                toast({ title: 'Transcription Error', description: 'Failed to process audio chunk.', variant: 'destructive' });
              } finally {
                setIsTranscribingChunk(false);
              }
            }
          }
        };
        
        mediaRecorderRef.current.onstart = () => {
          setRecordingState('recording');
          setElapsedTime(0);
          audioChunksRef.current = []; 
          if (recordingState === 'idle') {
            setRawTranscript(''); 
            setDiarizedTranscript(null);
            setCurrentRecordingFullAudioUri(null);
            setLoadedAudioUri(null); 
            const now = new Date();
            setCurrentSessionTitle(`Court Session - ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
          }
          toast({ title: 'Recording Started', description: 'Audio capture is active.', icon: <Mic className="h-5 w-5 text-green-500" /> });
        };

        mediaRecorderRef.current.onpause = () => {
           setRecordingState('paused');
           toast({ title: 'Recording Paused', icon: <Pause className="h-5 w-5 text-yellow-500" /> });
        };
        
        mediaRecorderRef.current.onresume = () => {
          setRecordingState('recording');
          toast({ title: 'Recording Resumed', icon: <Mic className="h-5 w-5 text-green-500" /> });
        };

        mediaRecorderRef.current.onstop = async () => {
          setRecordingState('idle');
          stream.getTracks().forEach(track => track.stop());
          toast({ title: 'Recording Stopped', icon: <Square className="h-5 w-5 text-red-500" /> });
          
          if (audioChunksRef.current.length > 0) {
            const fullAudioBlob = new Blob(audioChunksRef.current, { type: audioChunksRef.current[0]?.type || 'audio/webm' });
            try {
              const audioDataUri = await blobToDataURI(fullAudioBlob);
              setCurrentRecordingFullAudioUri(audioDataUri);
              if (rawTranscript.trim() && audioDataUri && autoTranscription) {
                setTimeout(() => handleDiarizeTranscript(audioDataUri, rawTranscript), 0); 
              }
            } catch (error) {
              console.error("Error creating full audio URI:", error);
              toast({ title: 'Audio Processing Error', description: 'Failed to process full recording.', variant: 'destructive' });
            }
          }
          mediaRecorderRef.current = null;
        };
        
        mediaRecorderRef.current.start(5000); // Transcribe every 5 seconds

      } catch (error) {
        console.error('Error accessing microphone:', error);
        toast({ title: 'Microphone Error', description: 'Could not access microphone. Please check permissions.', variant: 'destructive' });
      }
    }
  };

  const handlePauseRecording = () => {
    if (mediaRecorderRef.current && recordingState === 'recording') {
      mediaRecorderRef.current.pause();
    }
  };
  
  const handleResumeRecording = () => {
    if (mediaRecorderRef.current && recordingState === 'paused') {
      mediaRecorderRef.current.resume();
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && (recordingState === 'recording' || recordingState === 'paused')) {
      mediaRecorderRef.current.stop();
    }
  };

  const handleInitiateSave = () => {
    if (!rawTranscript.trim() && !diarizedTranscript) {
      toast({ title: "Cannot Save", description: "Transcript is empty.", variant: "destructive" });
      return;
    }
    if (!currentSessionTitle) {
        const now = new Date();
        setCurrentSessionTitle(`Court Session - ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
    }
    setShowSaveDialog(true);
  };

  const handleConfirmSave = async () => {
    if (!currentSessionTitle.trim()) {
      toast({ title: "Invalid Title", description: "Please enter a title for the session.", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    
    const newSavedTranscript: SavedTranscript = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      title: currentSessionTitle,
      rawTranscript: rawTranscript,
      diarizedTranscript: diarizedTranscript,
      audioDataUri: currentRecordingFullAudioUri || loadedAudioUri, 
    };
    persistSavedTranscripts([newSavedTranscript, ...savedTranscripts]);
    
    setIsSaving(false);
    setShowSaveDialog(false);
    toast({ title: 'Transcript Saved', description: `"${newSavedTranscript.title}" has been saved.`, icon: <CheckCircle2 className="h-5 w-5 text-green-500" /> });
  };
  
  const handleDeleteSavedTranscript = (id: string) => {
    const updated = savedTranscripts.filter(t => t.id !== id);
    persistSavedTranscripts(updated);
    toast({ title: 'Transcript Deleted', variant: 'destructive' });
  };

  const handleLoadSavedTranscript = (selectedTranscript: SavedTranscript) => {
    if (recordingState !== 'idle') {
        toast({ title: 'Cannot Load', description: 'Please stop the current recording before loading another transcript.', variant: 'destructive'});
        return;
    }
    setRawTranscript(selectedTranscript.rawTranscript);
    setDiarizedTranscript(selectedTranscript.diarizedTranscript || null);
    const audioToLoad = selectedTranscript.audioDataUri || null;
    setLoadedAudioUri(audioToLoad);
    setCurrentRecordingFullAudioUri(null);
    setCurrentSessionTitle(selectedTranscript.title); 
    setActiveView("transcriptions");
    toast({ title: 'Transcript Loaded', description: `"${selectedTranscript.title}" is now active.` });

    if (audioToLoad && selectedTranscript.rawTranscript.trim() && !selectedTranscript.diarizedTranscript) {
      setTimeout(() => handleDiarizeTranscript(audioToLoad, selectedTranscript.rawTranscript), 0);
    }
  };

  const handleSearch = async () => {
    const transcriptToSearch = diarizedTranscript ? diarizedTranscript.map(s => `${s.speaker}: ${s.text}`).join('\n') : rawTranscript;
    if (!searchTerm.trim() || !transcriptToSearch.trim()) {
      toast({ title: 'Search Error', description: 'Please enter a search term and ensure there is a transcript to search.', variant: 'destructive' });
      return;
    }
    setIsSearching(true);
    setSearchError(null);
    setSearchResults(null);
    try {
      const input: SmartSearchInput = { transcription: transcriptToSearch, searchTerm };
      const response = await searchTranscriptAction(input);
      if (response.results) {
        setSearchResults(response.results);
        toast({ title: 'Search Complete', description: `Found results for "${searchTerm}".` });
      } else if (response.error) {
        setSearchError(response.error);
        toast({ title: 'Search Failed', description: response.error, variant: 'destructive' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An unknown error occurred.';
      setSearchError(message);
      toast({ title: 'Search Exception', description: message, variant: 'destructive' });
    } finally {
      setIsSearching(false);
    }
  };
  
  const handleDownloadTranscript = () => {
    const transcriptToDownload = diarizedTranscript 
      ? diarizedTranscript.map(s => `${s.speaker}:\n${s.text}`).join('\n\n') 
      : rawTranscript;

    if (!transcriptToDownload.trim()) {
      toast({ title: "Cannot Download", description: "Transcript is empty.", variant: "destructive" });
      return;
    }
    const title = currentSessionTitle || `Transcript-${new Date().toISOString()}`;
    const blob = new Blob([transcriptToDownload], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast({ title: 'Download Started', description: `"${title}.txt" is downloading.` });
  };

  useEffect(() => {
    const targetRef = activeView === 'liveSession' ? liveSessionScrollRef : transcriptScrollAreaRef;
    if (targetRef.current && (rawTranscript || diarizedTranscript)) {
        const scrollElement = targetRef.current.querySelector('div[data-radix-scroll-area-viewport]');
        if (scrollElement) {
            scrollElement.scrollTop = scrollElement.scrollHeight;
        }
    }
  }, [rawTranscript, diarizedTranscript, activeView]);


  const getMicIconSized = (size = "h-5 w-5") => {
    if (recordingState === 'recording') {
      return <Mic className={`${size} text-red-500 animate-pulse`} />;
    }
    return <Mic className={size} />;
  };
  
  const canManuallyDiarize = recordingState === 'idle' && !!rawTranscript.trim() && !!(currentRecordingFullAudioUri || loadedAudioUri) && !isDiarizing;
  const canSave = recordingState === 'idle' && (!!rawTranscript.trim() || !!diarizedTranscript);
  const canDownload = recordingState === 'idle' && (!!rawTranscript.trim() || !!diarizedTranscript);

  const renderTopToolbar = () => (
    <Card className="mb-4 shadow-md">
      <CardContent className="p-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2 items-center">
          {recordingState === 'idle' && (
            <Button onClick={handleStartRecording} className="bg-green-600 hover:bg-green-700 text-white" aria-label="Start Recording">
              {getMicIconSized()} Start Recording
            </Button>
          )}
          {recordingState === 'recording' && (
            <Button onClick={handlePauseRecording} variant="outline" className="border-yellow-500 text-yellow-600 hover:bg-yellow-50" aria-label="Pause Recording">
              <Pause className="h-5 w-5" /> Pause
            </Button>
          )}
          {recordingState === 'paused' && (
            <Button onClick={handleResumeRecording} variant="outline" className="border-green-500 text-green-600 hover:bg-green-50" aria-label="Resume Recording">
              {getMicIconSized()} Resume
            </Button>
          )}
          {(recordingState === 'recording' || recordingState === 'paused') && (
            <Button onClick={handleStopRecording} variant="destructive" aria-label="Stop Recording">
              <Square className="h-5 w-5" /> Stop
            </Button>
          )}
           <Button variant="outline" size="sm" disabled><PlusCircle className="mr-1 h-4 w-4" /> Mark Timestamp</Button>
           <Button variant="outline" size="sm" disabled><Edit className="mr-1 h-4 w-4" /> Add Note</Button>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center space-x-2">
            <Switch id="auto-transcription-toggle" checked={autoTranscription} onCheckedChange={setAutoTranscription} />
            <Label htmlFor="auto-transcription-toggle" className="text-sm">Auto Transcription</Label>
          </div>
          <div className="text-sm font-mono p-2 rounded-md bg-muted tabular-nums">
            <Clock className="inline h-4 w-4 mr-1 align-text-bottom" /> {formatTime(elapsedTime)}
          </div>
           <Tooltip>
            <TooltipTrigger asChild><Button variant="ghost" size="icon" className="text-muted-foreground"><Headphones size={18}/></Button></TooltipTrigger>
            <TooltipContent><p>Mic/Input Source (Placeholder)</p></TooltipContent>
          </Tooltip>
        </div>
      </CardContent>
      {(isTranscribingChunk || (recordingState === 'recording' && !isTranscribingChunk && autoTranscription)) && (
          <CardFooter className="p-2 border-t">
            <div className="flex items-center text-xs text-muted-foreground">
              {isTranscribingChunk ? 
                <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Transcribing audio chunk...</> :
                <><Mic className="h-3 w-3 text-red-500 animate-pulse mr-1" /> Listening...</>
              }
            </div>
          </CardFooter>
        )}
    </Card>
  );

  const renderLiveSessionView = () => (
    <div className="h-full flex flex-col">
      {renderTopToolbar()}
      <div className="flex-grow grid md:grid-cols-2 gap-4 overflow-hidden">
        {/* Left Panel: Audio/Video + Controls */}
        <Card className="shadow-sm flex flex-col">
          <CardHeader>
            <CardTitle className="text-lg flex items-center"><FileAudio className="mr-2 h-5 w-5"/>Media Feed</CardTitle>
            <CardDescription className="text-xs">Audio playback and controls. Video feed placeholder.</CardDescription>
          </CardHeader>
          <CardContent className="flex-grow flex flex-col justify-center items-center space-y-4 p-4">
            {(currentRecordingFullAudioUri || loadedAudioUri) && activeView === 'liveSession' && (
              <audio 
                key={loadedAudioUri || currentRecordingFullAudioUri} 
                controls 
                src={loadedAudioUri || currentRecordingFullAudioUri || undefined} 
                className="w-full rounded-md shadow-sm"
              >
                Your browser does not support the audio element.
              </audio>
            )}
             <div className="w-full p-4 border rounded-md bg-muted/30 text-center text-muted-foreground">
              <Video className="h-16 w-16 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Video Feed Placeholder</p>
            </div>
            <div className="w-full p-4 border rounded-md bg-muted/30 text-center text-muted-foreground">
              <Sigma className="h-10 w-10 mx-auto mb-2 opacity-50" /> {/* Placeholder for waveform */}
              <p className="text-sm">Live Audio Waveform Placeholder</p>
            </div>
          </CardContent>
           <CardFooter className="p-2 border-t flex justify-end">
             <Button variant="ghost" size="sm" disabled><ToggleLeft className="mr-1 h-4 w-4"/> Noise Suppression</Button>
           </CardFooter>
        </Card>

        {/* Right Panel: Live Transcription */}
        <Card className="shadow-sm flex flex-col">
          <CardHeader>
             <div className="flex justify-between items-center">
                <CardTitle className="text-lg flex items-center"><MessageSquare className="mr-2 h-5 w-5"/>Live Transcription</CardTitle>
                <Tooltip>
                    <TooltipTrigger asChild><Button variant="ghost" size="icon" className="text-muted-foreground" disabled><Palette size={18}/></Button></TooltipTrigger>
                    <TooltipContent><p>Language Model/Dictionary Adjustments (Placeholder)</p></TooltipContent>
                </Tooltip>
             </div>
            <CardDescription className="text-xs">Real-time feed. Scroll to bottom for latest. Speaker ID and punctuation are AI-assisted.</CardDescription>
          </CardHeader>
          <CardContent className="flex-grow overflow-hidden p-4">
            <ScrollArea ref={liveSessionScrollRef} className="h-full w-full rounded-md border p-3 bg-muted/30">
              <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">
              {rawTranscript || <span className="text-muted-foreground">Waiting for recording to start or for auto-transcription...</span>}
              {isDiarizing && activeView === 'liveSession' && <span className="block mt-2 text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin mr-1" /> Identifying speakers...</span>}
              </pre>
            </ScrollArea>
          </CardContent>
          <CardFooter className="p-2 border-t flex justify-end">
            <Button variant="ghost" size="sm" disabled><Edit3 className="mr-1 h-4 w-4"/> Manual Edit</Button>
          </CardFooter>
        </Card>
      </div>
      {/* Notes Panel Placeholder */}
      <Card className="mt-4 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Notes Panel (Collapsible - Placeholder)</CardTitle>
        </CardHeader>
        <CardContent className="p-4 text-muted-foreground text-sm">
          Timestamped notes, comments, and tagging will appear here.
        </CardContent>
      </Card>
    </div>
  );

  const renderRecordingsView = () => (
    <Card className="shadow-lg h-full flex flex-col">
      <CardHeader>
        <CardTitle className="text-xl flex items-center"><FolderOpen className="mr-2 h-6 w-6" />Saved Sessions</CardTitle>
        <CardDescription>Load or delete previously saved court proceeding transcripts and audio.</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow overflow-auto">
        {savedTranscripts.length > 0 ? (
          <ScrollArea className="h-full max-h-[calc(100vh-220px)]"> {/* Adjust height as needed */}
            <ul className="space-y-3">
              {savedTranscripts.sort((a,b) => b.timestamp - a.timestamp).map(st => (
                <li key={st.id} className="flex flex-col sm:flex-row justify-between sm:items-center p-3 border rounded-md hover:bg-muted/50 transition-colors shadow-sm">
                  <div className="mb-2 sm:mb-0">
                    <p className="font-medium">{st.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(st.timestamp).toLocaleString()}
                      {st.diarizedTranscript ? ' (Diarized)' : ' (Raw transcript)'}
                      {st.audioDataUri ? ' (Audio available)' : ' (No audio)'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="sm" onClick={() => handleLoadSavedTranscript(st)} aria-label={`Load ${st.title}`}>
                          <FileText className="h-4 w-4 mr-1"/> Load
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent><p>Load this session</p></TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="destructive" size="sm" onClick={() => handleDeleteSavedTranscript(st.id)} aria-label={`Delete ${st.title}`}>
                          <Trash2 className="h-4 w-4 mr-1"/> Delete
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent><p>Delete this session</p></TooltipContent>
                    </Tooltip>
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>
        ) : (
          <p className="text-muted-foreground text-center py-8">No saved sessions yet. Recordings from the 'Live Session' tab can be saved here.</p>
        )}
      </CardContent>
    </Card>
  );

  const renderTranscriptionsView = () => (
     <Card className="shadow-lg h-full flex flex-col">
      <CardHeader>
        <CardTitle className="text-xl flex items-center"><ListOrdered className="mr-2 h-6 w-6" />Active Transcript: {currentSessionTitle || "Untitled Session"}</CardTitle>
        <CardDescription>Review the current transcript. Diarization attempts to run automatically if audio is available. Use controls to save or download.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 flex-grow overflow-auto">
        {(currentRecordingFullAudioUri || loadedAudioUri) && (
          <div>
            <h3 className="text-md font-semibold mb-1">Audio Playback</h3>
            <audio 
              key={loadedAudioUri || currentRecordingFullAudioUri} 
              controls 
              src={loadedAudioUri || currentRecordingFullAudioUri || undefined} 
              className="w-full rounded-md shadow-sm"
            >
              Your browser does not support the audio element.
            </audio>
          </div>
        )}
        <div>
            <div className="flex justify-between items-center mb-1">
                 <h3 className="text-md font-semibold">
                    {diarizedTranscript ? "Diarized Transcript" : "Raw Transcript"}
                 </h3>
                 {diarizedTranscript && <Users className="h-5 w-5 text-primary" />}
                 {isDiarizing && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
            </div>
          <ScrollArea ref={transcriptScrollAreaRef} className="h-[calc(100vh-420px)] w-full rounded-md border p-3 bg-muted/30"> {/* Adjust height */}
            {diarizedTranscript ? (
              <div className="space-y-3">
                {diarizedTranscript.map((segment, index) => (
                  <div key={index}>
                    <strong className={`${getSpeakerColor(segment.speaker)} font-semibold`}>{segment.speaker}:</strong>
                    <p className="text-sm whitespace-pre-wrap font-sans leading-relaxed ml-2">{segment.text}</p>
                  </div>
                ))}
              </div>
            ) : rawTranscript ? (
              <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">
                {rawTranscript}
                {isDiarizing && <span className="block mt-2 text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin mr-1" /> Attempting automatic diarization...</span>}
              </pre>
            ) : (
                 <span className="text-muted-foreground">No transcript available. Record a new session or load one from 'Recordings'.</span>
            )}
          </ScrollArea>
        </div>
      </CardContent>
       <CardFooter className="border-t p-4 flex flex-wrap gap-2 items-center">
            <Tooltip>
                <TooltipTrigger asChild>
                <Button onClick={() => handleDiarizeTranscript()} disabled={!canManuallyDiarize} variant="outline" aria-label="Diarize Transcript Manually">
                    {isDiarizing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Users className="h-5 w-5" />} Diarize
                </Button>
                </TooltipTrigger>
                <TooltipContent><p>Manually re-run speaker identification</p></TooltipContent>
            </Tooltip>
            <Tooltip>
                <TooltipTrigger asChild>
                <Button onClick={handleInitiateSave} disabled={!canSave || isSaving} variant="secondary" aria-label="Save Transcript">
                    {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />} Save Session
                </Button>
                </TooltipTrigger>
                <TooltipContent><p>Save current transcript and audio</p></TooltipContent>
            </Tooltip>
            <Tooltip>
                <TooltipTrigger asChild>
                <Button onClick={handleDownloadTranscript} disabled={!canDownload} variant="outline" aria-label="Download Transcript">
                    <Download className="h-5 w-5" /> Download TXT
                </Button>
                </TooltipTrigger>
                <TooltipContent><p>Download transcript as .txt</p></TooltipContent>
            </Tooltip>
            {isDiarizing && (
            <div className="flex items-center text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span>Identifying speakers... This may take a few moments.</span>
            </div>
            )}
        </CardFooter>
    </Card>
  );

  const renderSearchView = () => (
    <Card className="shadow-lg h-full flex flex-col">
      <CardHeader>
        <CardTitle className="text-xl flex items-center"><Search className="mr-2 h-6 w-6" />Smart Case Search</CardTitle>
        <CardDescription>Search the active transcript for keywords, phrases, or legal references.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 flex-grow overflow-auto">
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder="Enter search term..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-grow"
            aria-label="Search Term"
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          />
          <Button onClick={handleSearch} disabled={isSearching || (!rawTranscript.trim() && !diarizedTranscript) || !searchTerm.trim()} aria-label="Search Transcript">
            {isSearching ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />} Search
          </Button>
        </div>
        {searchError && (
          <div className="text-red-600 p-3 bg-red-100 border border-red-300 rounded-md flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" /> {searchError}
          </div>
        )}
        {searchResults && (
          <div className="space-y-3 p-3 bg-green-50 border border-green-200 rounded-md">
            <h3 className="font-semibold text-lg text-primary">Search Results:</h3>
            <p className="text-sm italic text-muted-foreground">{searchResults.summary}</p>
            <ScrollArea className="h-60"> {/* Adjust height */}
                <ul className="list-disc list-inside space-y-1 text-sm pl-2">
                {searchResults.searchResults.map((result, index) => (
                    <li key={index} className="py-1 border-b border-border last:border-b-0">{result}</li>
                ))}
                </ul>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const renderSettingsView = () => (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl flex items-center"><Settings className="mr-2 h-6 w-6" />Application Settings</CardTitle>
        <CardDescription>Configure application preferences (Placeholders).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-2">Audio Configuration</h3>
          <p className="text-sm text-muted-foreground">Input/output device selection, noise cancellation options, etc.</p>
        </div>
        <div>
          <h3 className="text-lg font-semibold mb-2">Transcription Models</h3>
          <p className="text-sm text-muted-foreground">Select custom language models or dictionaries for legal terms.</p>
        </div>
        <div>
          <h3 className="text-lg font-semibold mb-2">Data Storage</h3>
          <p className="text-sm text-muted-foreground">Manage cloud or local storage options, backup, and archiving.</p>
        </div>
         <div>
          <h3 className="text-lg font-semibold mb-2">Theme</h3>
          <p className="text-sm text-muted-foreground">Dark mode is automatically handled by your system preference or can be toggled with a browser extension that modifies CSS custom properties.</p>
        </div>
      </CardContent>
    </Card>
  );

  const renderUserProfileView = () => (
     <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl flex items-center"><UserCircle className="mr-2 h-6 w-6" />User Profile</CardTitle>
        <CardDescription>Manage your profile information (Placeholder).</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">User authentication and profile management features will be available here in a future update.</p>
      </CardContent>
    </Card>
  );

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar side="left" variant="sidebar" collapsible="icon" className="border-r">
        <SidebarHeader className="p-4">
           <div className="flex items-center gap-2">
             <Landmark className={`h-8 w-8 text-primary transition-all ${sidebarOpen ? "" : "ml-1"}`} />
             <h1 className={`text-2xl font-bold tracking-tight text-primary ${sidebarOpen ? "opacity-100" : "opacity-0 hidden group-hover:opacity-100 group-hover:block transition-opacity duration-300"}`}>VeriCourt</h1>
           </div>
        </SidebarHeader>
        <SidebarContent className="p-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => setActiveView('liveSession')} isActive={activeView === 'liveSession'} tooltip="Live Session">
                <Mic /> <span className={sidebarOpen ? "" : "sr-only"}>Live Session</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => setActiveView('recordings')} isActive={activeView === 'recordings'} tooltip="Recordings">
                <FolderOpen /> <span className={sidebarOpen ? "" : "sr-only"}>Recordings</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => setActiveView('transcriptions')} isActive={activeView === 'transcriptions'} tooltip="Transcriptions">
                <FileText /> <span className={sidebarOpen ? "" : "sr-only"}>Transcriptions</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => setActiveView('searchCases')} isActive={activeView === 'searchCases'} tooltip="Search Cases">
                <Search /> <span className={sidebarOpen ? "" : "sr-only"}>Search Cases</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="p-2">
           <SidebarMenu>
             <SidebarMenuItem>
              <SidebarMenuButton onClick={() => setActiveView('settings')} isActive={activeView === 'settings'} tooltip="Settings">
                <Settings /> <span className={sidebarOpen ? "" : "sr-only"}>Settings</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => setActiveView('userProfile')} isActive={activeView === 'userProfile'} tooltip="User Profile">
                <UserCircle /> <span className={sidebarOpen ? "" : "sr-only"}>User Profile</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
                <SidebarMenuButton onClick={() => window.open('https://github.com/firebase/genkit/issues/new/choose', '_blank')} tooltip="Report Issue/Help">
                    <CircleHelp /> <span className={sidebarOpen ? "" : "sr-only"}>Help / Report Issue</span>
                </SidebarMenuButton>
            </SidebarMenuItem>
           </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className={`p-4 md:p-6 transition-all duration-300 ease-in-out ${sidebarOpen ? "md:ml-[16rem]" : "md:ml-[3rem]"}`}>
        <header className="flex items-center justify-between mb-2 md:mb-4">
            <div className="md:hidden"> {/* Show AppLogo only if sidebar is collapsed or on mobile */}
                {!sidebarOpen && <AppLogo />}
            </div>
            <div className={`md:hidden ml-auto ${sidebarOpen ? 'hidden': ''}`}> {/* Sidebar trigger for mobile/collapsed */}
                <SidebarTrigger />
            </div>
             <div className="hidden md:block"> {/* Empty div to push content or for breadcrumbs later */}
             </div>
        </header>
        
        <main className="flex-grow">
          {activeView === 'liveSession' && renderLiveSessionView()}
          {activeView === 'recordings' && renderRecordingsView()}
          {activeView === 'transcriptions' && renderTranscriptionsView()}
          {activeView === 'searchCases' && renderSearchView()}
          {activeView === 'settings' && renderSettingsView()}
          {activeView === 'userProfile' && renderUserProfileView()}
        </main>

        <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save Current Session</DialogTitle>
              <DialogDescription>
                Enter or confirm the title for this court proceeding session. The audio and transcript (raw and diarized, if available) will be saved.
              </DialogDescription>
            </DialogHeader>
            <Input 
              placeholder="Session Title (e.g., Case XYZ - Day 1)"
              value={currentSessionTitle}
              onChange={(e) => setCurrentSessionTitle(e.target.value)}
              className="my-4"
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSaveDialog(false)}>Cancel</Button>
              <Button onClick={handleConfirmSave} disabled={isSaving || !currentSessionTitle.trim()}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
         <footer className="w-full mt-8 text-center text-xs text-muted-foreground">
            <Separator className="my-3"/>
            <p>&copy; {new Date().getFullYear()} VeriCourt (Naija Lawscribe). All rights reserved.</p>
            <p className="mt-1">Built with modern AI for Nigerian legal professionals.</p>
        </footer>
      </SidebarInset>
    </div>
  );
}
