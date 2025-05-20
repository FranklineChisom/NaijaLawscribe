
'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  Mic, Pause, Square, Save, Search, Loader2, AlertTriangle, CheckCircle2, FileText, Trash2, Download, Users, Settings, UserCircle, LayoutDashboard, FolderOpen, Edit, MessageSquare, Video, Palette, Landmark, Briefcase, Sigma, CircleHelp, FileAudio, Clock, PlusCircle, ToggleLeft, ToggleRight, Headphones,
  Play, SkipBack, SkipForward, MicOff, Calendar, Info, ListOrdered, User // Added User icon here
} from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea'; 

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
  DEFAULT: 'text-foreground', 
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
  const speakerMatch = upperIdentifier.match(/SPEAKER\s*(\d+)/);
  if (speakerMatch) {
    const speakerNum = parseInt(speakerMatch[1], 10);
    const colorKeys = Object.keys(speakerColors).filter(k => k !== 'DEFAULT' && !['JUDGE', 'COUNSEL', 'WITNESS', 'PLAINTIFF', 'DEFENDANT'].includes(k));
    return colorKeys.length > 0 ? speakerColors[colorKeys[speakerNum % colorKeys.length]] : speakerColors.DEFAULT;
  }
  return speakerColors.DEFAULT;
};


export default function CourtProceedingsPage() {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [rawTranscript, setRawTranscript] = useState<string>('');
  const [diarizedTranscript, setDiarizedTranscript] = useState<DiarizedSegment[] | null>(null);
  
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [transcriptSearchTerm, setTranscriptSearchTerm] = useState<string>(''); 
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<SmartSearchOutput | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  
  const [isTranscribingChunk, setIsTranscribingChunk] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isDiarizing, setIsDiarizing] = useState<boolean>(false);

  const [savedTranscripts, setSavedTranscripts] = useState<SavedTranscript[]>([]);
  const [currentSessionTitle, setCurrentSessionTitle] = useState<string>('Untitled Session');
  const [showSaveDialog, setShowSaveDialog] = useState<boolean>(false);

  const [currentRecordingFullAudioUri, setCurrentRecordingFullAudioUri] = useState<string | null>(null);
  const [loadedAudioUri, setLoadedAudioUri] = useState<string | null>(null);
  
  const [activeView, setActiveView] = useState<ActiveView>('liveSession');
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [autoTranscription, setAutoTranscription] = useState<boolean>(true);
  const [currentDateTime, setCurrentDateTime] = useState(new Date());


  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const transcriptScrollAreaRef = useRef<HTMLDivElement>(null); 
  const liveTranscriptScrollAreaRef = useRef<HTMLDivElement>(null); 
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const dateTimeIntervalRef = useRef<NodeJS.Timeout | null>(null);


  const { toast } = useToast();
  const { open: sidebarOpen } = useSidebar();

  useEffect(() => {
    const storedTranscripts = localStorage.getItem('naijaLawScribeTranscripts');
    if (storedTranscripts) {
      setSavedTranscripts(JSON.parse(storedTranscripts));
    }
    dateTimeIntervalRef.current = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 1000);

    return () => {
      if (dateTimeIntervalRef.current) clearInterval(dateTimeIntervalRef.current);
    };
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
      if (activeView === 'liveSession' && (!currentRecordingFullAudioUri && !loadedAudioUri)) {
         // Don't toast if it's an implicit call during live session without full audio yet.
      } else if (activeView !== 'liveSession' || (currentRecordingFullAudioUri || loadedAudioUri)){
         toast({ title: 'Diarization Skipped', description: 'Full audio and raw transcript are required for diarization.', variant: 'default' });
      }
      setDiarizedTranscript(null); // Clear any previous diarization if conditions aren't met
      return;
    }
    setIsDiarizing(true);
    setDiarizedTranscript(null); // Clear previous diarization before starting a new one
    try {
      const input: DiarizeTranscriptInput = { audioDataUri: audioForDiarization, rawTranscript: currentTranscript };
      const response = await diarizeTranscriptAction(input);
      if (response.segments) {
        setDiarizedTranscript(response.segments);
        toast({ title: 'Diarization Complete', description: 'Transcript has been segmented by speaker.', icon: <CheckCircle2 className="h-5 w-5 text-green-500" /> });
      } else if (response.error) {
        toast({ title: 'Diarization Failed', description: response.error, variant: 'destructive' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An unknown error occurred during diarization.';
      toast({ title: 'Diarization Exception', description: message, variant: 'destructive' });
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
              if (rawTranscript.trim() && audioDataUri) { // Removed autoTranscription check, diarize if conditions met
                setTimeout(() => handleDiarizeTranscript(audioDataUri, rawTranscript), 0); 
              }
            } catch (error) {
              console.error("Error creating full audio URI:", error);
              toast({ title: 'Audio Processing Error', description: 'Failed to process full recording.', variant: 'destructive' });
            }
          }
          mediaRecorderRef.current = null;
        };
        
        mediaRecorderRef.current.start(5000);

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
  
  const toggleMainRecording = () => {
    if (recordingState === 'recording') {
      handlePauseRecording();
    } else if (recordingState === 'paused') {
      handleResumeRecording();
    } else { 
      handleStartRecording();
    }
  };


  const handleInitiateSave = () => {
    if (!rawTranscript.trim() && !diarizedTranscript) {
      toast({ title: "Cannot Save", description: "Transcript is empty.", variant: "destructive" });
      return;
    }
    if (!currentSessionTitle.trim()) { // Ensure title isn't just whitespace
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
    setCurrentSessionTitle(selectedTranscript.title || "Untitled Session"); 
    setActiveView("transcriptions"); 
    toast({ title: 'Transcript Loaded', description: `"${selectedTranscript.title || "Untitled Session"}" is now active.` });

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
    const title = currentSessionTitle.trim() ? currentSessionTitle : `Transcript-${new Date().toISOString()}`;
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
    const targetRef = activeView === 'liveSession' ? liveTranscriptScrollAreaRef : transcriptScrollAreaRef;
    if (targetRef.current && (rawTranscript || diarizedTranscript)) {
        const scrollElement = targetRef.current.querySelector('div[data-radix-scroll-area-viewport]');
        if (scrollElement) {
            scrollElement.scrollTop = scrollElement.scrollHeight;
        }
    }
  }, [rawTranscript, diarizedTranscript, activeView]);
  
  const canManuallyDiarize = recordingState === 'idle' && !!rawTranscript.trim() && !!(currentRecordingFullAudioUri || loadedAudioUri) && !isDiarizing;
  const canSave = recordingState === 'idle' && (!!rawTranscript.trim() || !!diarizedTranscript);
  const canDownload = recordingState === 'idle' && (!!rawTranscript.trim() || !!diarizedTranscript);

  const renderLiveSessionHeader = () => (
    <header className="bg-primary text-primary-foreground p-3 md:p-4 shadow-md">
      <div className="flex flex-wrap justify-between items-center gap-2 md:gap-4">
        <h1 className="text-xl md:text-2xl font-semibold">Court Recording & Transcription</h1>
        <div className="flex items-center space-x-2 md:space-x-4 text-xs md:text-sm">
          <span className="flex items-center"><Calendar className="mr-1 md:mr-2" size={16} /> {currentDateTime.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</span>
          <span className="flex items-center"><Clock className="mr-1 md:mr-2" size={16} /> {currentDateTime.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
          {(recordingState === 'recording' || recordingState === 'paused') && (
            <span className="bg-green-500/80 text-white px-2 py-1 rounded-full text-xs font-medium animate-pulse">ACTIVE SESSION</span>
          )}
        </div>
      </div>
    </header>
  );

  const renderLiveSessionView = () => (
    <div className="h-full flex flex-col bg-background text-foreground">
      {renderLiveSessionHeader()}
      
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Case Information */}
        <div className="w-64 bg-muted/80 p-4 flex-col border-r hidden md:flex"> 
          <Card className="flex-grow flex flex-col shadow-sm">
            <CardHeader className="p-4">
              <CardTitle className="text-lg">Case Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm flex-grow overflow-y-auto px-4 pb-4">
              <div>
                <Label className="text-xs text-muted-foreground">Case Number</Label>
                <p className="font-medium">{currentSessionTitle.startsWith("Court Session -") ? "N/A (New Session)" : currentSessionTitle}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Case Title</Label>
                <p className="font-medium">State v. Johnson (Placeholder)</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Judge</Label>
                <p className="font-medium">Hon. Robert Wilson (Placeholder)</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Hearing Type</Label>
                <p className="font-medium">Motion to Suppress (Placeholder)</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Courtroom</Label>
                <p className="font-medium">304 (Placeholder)</p>
              </div>
              <Separator className="my-3" />
              <h3 className="font-semibold text-sm mb-2">Participants</h3>
              <ul className="space-y-1 text-xs">
                <li className="flex items-center"><User size={14} className="mr-2 text-primary" /> Judge Robert Wilson</li>
                <li className="flex items-center"><User size={14} className="mr-2 text-primary" /> John Smith (Prosecutor)</li>
                <li className="flex items-center"><User size={14} className="mr-2 text-primary" /> Jane Doe (Defense)</li>
                <li className="flex items-center"><User size={14} className="mr-2 text-primary" /> Michael Johnson (Defendant)</li>
                <li className="flex items-center"><User size={14} className="mr-2 text-primary" /> Sarah Green (Witness)</li>
              </ul>
            </CardContent>
            <CardFooter className="flex-col space-y-2 p-4 border-t">
               <Button onClick={handleInitiateSave} disabled={!canSave || isSaving} className="w-full">
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save size={16} className="mr-2" />} Save Session
              </Button>
              <Button onClick={handleDownloadTranscript} disabled={!canDownload} variant="outline" className="w-full">
                  <Download size={16} className="mr-2" /> Export Transcript
              </Button>
            </CardFooter>
          </Card>
        </div>
        
        {/* Middle - Audio Controls & Waveform & Transcript */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top: Waveform Visualization & Controls */}
          <div className="p-4 border-b">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold text-lg">Audio Recording</h2>
              <div className="flex items-center">
                <span className={`inline-block w-3 h-3 ${recordingState === 'recording' ? 'bg-red-500 animate-pulse' : recordingState === 'paused' ? 'bg-yellow-500' : 'bg-muted-foreground'} rounded-full mr-2`}></span>
                <span className="text-sm capitalize">{recordingState}</span>
                <span className="ml-4 text-sm font-mono tabular-nums">{formatTime(elapsedTime)}</span>
              </div>
            </div>
            
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <div className="flex-1 flex items-center justify-center my-4">
                  <div className="w-full">
                    <div className="relative w-full h-24 md:h-32 bg-muted/30 rounded-md">
                      <div className="absolute inset-0 flex items-center justify-center px-2 overflow-hidden">
                        {Array.from({ length: 80 }).map((_, i) => {
                           const barIsActive = recordingState === 'recording' && i < (elapsedTime % 80); // Simple active bar effect
                           const randomHeight = Math.random() * 60 + 20;
                           const dynamicHeight = isTranscribingChunk || (recordingState === 'recording' && autoTranscription) 
                                                ? randomHeight 
                                                : Math.sin(i * 0.1 + elapsedTime * 0.5) * 25 + 40; // Smoother idle wave
                          return (
                            <div 
                              key={i}
                              className={`mx-px rounded-sm transition-all duration-150 ease-out ${ barIsActive ? 'bg-primary' : 'bg-primary/50'}`}
                              style={{ 
                                height: `${dynamicHeight}%`,
                                width: '3px',
                              }}
                            />
                          );
                        })}
                      </div>
                        {(currentRecordingFullAudioUri || loadedAudioUri) && recordingState === 'idle' && (
                            <div className="absolute inset-0 p-2">
                                <audio 
                                    key={loadedAudioUri || currentRecordingFullAudioUri} 
                                    controls 
                                    src={loadedAudioUri || currentRecordingFullAudioUri || undefined} 
                                    className="w-full rounded-md shadow-sm opacity-80 hover:opacity-100 transition-opacity"
                                >
                                    Your browser does not support the audio element.
                                </audio>
                            </div>
                        )}
                         {recordingState !== 'idle' && !(currentRecordingFullAudioUri || loadedAudioUri) && (
                            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
                                {recordingState === 'recording' ? "Recording in progress..." : "Recording paused..."}
                            </div>
                        )}
                    </div>
                  </div>
                </div>
                
                <div className="flex justify-center items-center space-x-2 md:space-x-4 mt-2">
                  <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" disabled className="text-muted-foreground"><SkipBack size={20} /></Button></TooltipTrigger><TooltipContent><p>Previous Segment (Disabled)</p></TooltipContent></Tooltip>
                   <Button 
                    onClick={toggleMainRecording}
                    size="lg"
                    className={`p-3 rounded-full ${recordingState === 'recording' ? 'bg-red-600 hover:bg-red-700' : recordingState === 'paused' ? 'bg-yellow-500 hover:bg-yellow-600 text-yellow-foreground' : 'bg-primary hover:bg-primary/90'} text-primary-foreground w-16 h-16`}
                    aria-label={recordingState === 'recording' ? "Pause Recording" : recordingState === 'paused' ? "Resume Recording" : "Start Recording"}
                  >
                    {recordingState === 'recording' ? <Pause size={28} /> : <Play size={28} />}
                  </Button>
                  {(recordingState === 'recording' || recordingState === 'paused') && (
                     <Button onClick={handleStopRecording} variant="outline" size="lg" className="p-3 rounded-full border-destructive text-destructive hover:bg-destructive/10 w-16 h-16" aria-label="Stop Recording">
                        <Square size={28}/>
                     </Button>
                  )}
                  <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" disabled className="text-muted-foreground"><SkipForward size={20} /></Button></TooltipTrigger><TooltipContent><p>Next Segment (Disabled)</p></TooltipContent></Tooltip>
                </div>
                
                <div className="flex flex-wrap justify-between items-center mt-4 text-sm">
                  <div className="flex items-center">
                    <Button variant="outline" size="sm" className="mr-2" disabled>
                      {recordingState !== 'idle' ? <Mic size={16} className="text-green-500" /> : <MicOff size={16} />} 
                      <span className="ml-1">{recordingState !== 'idle' ? "Mic Active" : "Mic Off"}</span>
                    </Button>
                     <div className="flex items-center space-x-2">
                        <Switch id="auto-transcription-toggle" checked={autoTranscription} onCheckedChange={setAutoTranscription} />
                        <Label htmlFor="auto-transcription-toggle" className="text-xs">Auto Transcribe</Label>
                      </div>
                  </div>
                  <div className="flex space-x-2 mt-2 sm:mt-0">
                    <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" disabled className="text-muted-foreground"><Headphones size={18}/></Button></TooltipTrigger><TooltipContent><p>Audio Input/Output Settings (Disabled)</p></TooltipContent></Tooltip>
                    <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" disabled className="text-muted-foreground"><Info size={18} /></Button></TooltipTrigger><TooltipContent><p>Session Info (Disabled)</p></TooltipContent></Tooltip>
                  </div>
                </div>
                 {(isTranscribingChunk || (recordingState === 'recording' && !isTranscribingChunk && autoTranscription)) && (
                    <div className="mt-2 text-xs text-muted-foreground flex items-center">
                      {isTranscribingChunk ? 
                        <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Transcribing audio chunk...</> :
                        <><Mic className="h-3 w-3 text-red-500 animate-pulse mr-1" /> Listening...</>
                      }
                    </div>
                  )}
              </CardContent>
            </Card>
          </div>
          
          <div className="flex-1 p-4 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold text-lg">Real-time Transcript</h2>
              <div className="relative">
                <Input 
                  type="text" 
                  placeholder="Search transcript..." 
                  value={transcriptSearchTerm}
                  onChange={(e) => setTranscriptSearchTerm(e.target.value)}
                  className="pl-8 pr-4 py-1 text-sm h-8 w-48 md:w-64 bg-card border-border focus:border-primary"
                />
                <Search size={16} className="absolute left-2 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
            
            <Card className="flex-1 shadow-sm overflow-hidden">
              <CardContent className="h-full p-0">
                <ScrollArea ref={liveTranscriptScrollAreaRef} className="h-full w-full rounded-md">
                  <div className="p-4 space-y-3 font-mono text-sm">
                    {diarizedTranscript ? (
                       diarizedTranscript.map((segment, index) => (
                          (!transcriptSearchTerm || segment.text.toLowerCase().includes(transcriptSearchTerm.toLowerCase()) || segment.speaker.toLowerCase().includes(transcriptSearchTerm.toLowerCase())) && (
                            <div key={index}>
                              <strong className={`${getSpeakerColor(segment.speaker)} font-semibold`}>{segment.speaker}:</strong>
                              <p className="whitespace-pre-wrap leading-relaxed ml-2">{segment.text}</p>
                            </div>
                          )
                        ))
                    ) : rawTranscript ? (
                      <pre className="whitespace-pre-wrap leading-relaxed">
                        {(!transcriptSearchTerm || rawTranscript.toLowerCase().includes(transcriptSearchTerm.toLowerCase())) ? rawTranscript : <span className="text-muted-foreground">No matches for "{transcriptSearchTerm}" in raw transcript.</span>}
                      </pre>
                    ) : (
                         <span className="text-muted-foreground">Waiting for recording or transcription...</span>
                    )}
                    {isDiarizing && <div className="flex items-center text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin mr-1" /> Identifying speakers...</div>}
                    {recordingState === 'recording' && autoTranscription && !isTranscribingChunk && (
                      <div className="flex items-center animate-pulse text-muted-foreground">
                        <div className="h-2 w-2 rounded-full bg-primary mr-1 animate-ping delay-75"></div>
                        <div className="h-2 w-2 rounded-full bg-primary mr-1 animate-ping delay-150"></div>
                        <div className="h-2 w-2 rounded-full bg-primary animate-ping delay-300"></div>
                        <span className="ml-2 text-xs">Transcribing...</span>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
        
        <div className="w-72 bg-muted/80 p-4 border-l hidden lg:flex flex-col"> 
          <Card className="flex-grow flex flex-col shadow-sm">
            <CardHeader className="p-4">
              <CardTitle className="text-lg">Annotations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm flex-grow overflow-y-auto px-4 pb-4">
              <div className="mb-4">
                <Label htmlFor="annotation-text" className="block text-xs font-medium mb-1">Add Note or Tag</Label>
                <Textarea 
                  id="annotation-text"
                  className="w-full border rounded-md p-2 text-sm bg-card focus:border-primary" 
                  rows={3}
                  placeholder="Add note about current testimony..."
                  disabled
                />
                <div className="flex justify-between mt-2">
                  <select className="text-xs border rounded p-1 bg-card text-foreground w-2/3 focus:border-primary" disabled>
                    <option>Select tag (e.g. Evidence)</option>
                    <option>Important</option>
                    <option>Evidence</option>
                    <option>Objection</option>
                  </select>
                  <Button size="sm" className="text-xs" disabled>Add</Button>
                </div>
              </div>
              
              <Separator className="my-3"/>
              <h3 className="font-medium text-sm">Recent Annotations (Placeholder)</h3>
              <div className="bg-card p-3 rounded border text-xs shadow-sm">
                <div className="flex justify-between items-start">
                  <span className="bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 px-2 py-0.5 rounded text-xs">Important</span>
                  <span className="text-xs text-muted-foreground">10:40 AM</span>
                </div>
                <p className="mt-1">Defendant admitted he was present at the scene but denied involvement.</p>
              </div>
               <div className="bg-card p-3 rounded border text-xs shadow-sm">
                <div className="flex justify-between items-start">
                  <span className="bg-blue-500/20 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded text-xs">Evidence</span>
                  <span className="text-xs text-muted-foreground">10:35 AM</span>
                </div>
                <p className="mt-1">Officer testified search was conducted after observing suspicious behavior.</p>
              </div>
               <div className="bg-card p-3 rounded border text-xs shadow-sm">
                <div className="flex justify-between items-start">
                  <span className="bg-red-500/20 text-red-700 dark:text-red-400 px-2 py-0.5 rounded text-xs">Objection</span>
                  <span className="text-xs text-muted-foreground">10:30 AM</span>
                </div>
                <p className="mt-1">Defense objected to characterization.</p>
              </div>
            </CardContent>
            <CardFooter className="p-4 border-t">
                <Button variant="outline" className="w-full text-xs" disabled>View All Notes</Button>
            </CardFooter>
          </Card>
        </div>
      </div>
      
      <footer className="bg-muted/50 p-2 border-t flex flex-wrap justify-between items-center text-xs text-muted-foreground">
        <div className="flex items-center">
          <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
          <span>System Status: Online</span>
        </div>
        <div className="flex space-x-3">
          <span>Storage: 512 GB Available (Placeholder)</span>
          <span>Backup: Auto (Placeholder)</span>
        </div>
      </footer>
    </div>
  );

  const renderRecordingsView = () => (
    <Card className="shadow-lg h-full flex flex-col">
      <CardHeader>
        <CardTitle className="text-xl flex items-center"><FolderOpen className="mr-2 h-6 w-6 text-primary" />Saved Sessions</CardTitle>
        <CardDescription>Load or delete previously saved court proceeding transcripts and audio.</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow overflow-auto p-4">
        {savedTranscripts.length > 0 ? (
          <ScrollArea className="h-full max-h-[calc(100vh-220px)]">
            <ul className="space-y-3">
              {savedTranscripts.sort((a,b) => b.timestamp - a.timestamp).map(st => (
                <li key={st.id} className="flex flex-col sm:flex-row justify-between sm:items-center p-3 border rounded-md hover:bg-muted/50 transition-colors shadow-sm bg-card">
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
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <FolderOpen className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-center py-8">No saved sessions yet. Recordings from the 'Live Session' tab can be saved here.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const renderTranscriptionsView = () => (
     <Card className="shadow-lg h-full flex flex-col">
      <CardHeader>
        <CardTitle className="text-xl flex items-center">
            <ListOrdered className="mr-2 h-6 w-6 text-primary" /> 
            Active Transcript: <span className="ml-2 font-normal text-lg">{currentSessionTitle || "Untitled Session"}</span>
        </CardTitle>
        <CardDescription>Review the current transcript. Diarization attempts to run automatically if audio is available. Use controls to save or download.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 flex-grow overflow-auto p-4">
        {(currentRecordingFullAudioUri || loadedAudioUri) && (
          <div>
            <h3 className="text-md font-semibold mb-1 text-primary">Audio Playback</h3>
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
                 <h3 className="text-md font-semibold text-primary">
                    {diarizedTranscript ? "Diarized Transcript" : "Raw Transcript"}
                 </h3>
                 <div className="flex items-center gap-2">
                    {diarizedTranscript && <Users className="h-5 w-5 text-primary" />}
                    {isDiarizing && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
                 </div>
            </div>
          <ScrollArea ref={transcriptScrollAreaRef} className="h-[calc(100vh-450px)] w-full rounded-md border p-3 bg-muted/30"> 
            {diarizedTranscript ? (
              <div className="space-y-3 font-mono text-sm">
                {diarizedTranscript.map((segment, index) => (
                  <div key={index}>
                    <strong className={`${getSpeakerColor(segment.speaker)} font-semibold`}>{segment.speaker}:</strong>
                    <p className="whitespace-pre-wrap leading-relaxed ml-2">{segment.text}</p>
                  </div>
                ))}
              </div>
            ) : rawTranscript ? (
              <pre className="text-sm whitespace-pre-wrap font-mono leading-relaxed">
                {rawTranscript}
                {isDiarizing && <span className="block mt-2 text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin mr-1" /> Attempting automatic diarization...</span>}
              </pre>
            ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                    <FileText className="w-16 h-16 mb-4 opacity-50" />
                    <span className="text-center">No transcript available. Record a new session or load one from 'Recordings'.</span>
                </div>
            )}
          </ScrollArea>
        </div>
      </CardContent>
       <CardFooter className="border-t p-4 flex flex-wrap gap-2 items-center bg-muted/50">
            <Tooltip>
                <TooltipTrigger asChild>
                <Button onClick={() => handleDiarizeTranscript()} disabled={!canManuallyDiarize} variant="outline" aria-label="Diarize Transcript Manually">
                    {isDiarizing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Users className="h-5 w-5" />} 
                    <span className="ml-2 hidden sm:inline">Diarize</span>
                </Button>
                </TooltipTrigger>
                <TooltipContent><p>Manually re-run speaker identification</p></TooltipContent>
            </Tooltip>
            <Tooltip>
                <TooltipTrigger asChild>
                <Button onClick={handleInitiateSave} disabled={!canSave || isSaving} aria-label="Save Transcript">
                    {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />} 
                     <span className="ml-2 hidden sm:inline">Save Session</span>
                </Button>
                </TooltipTrigger>
                <TooltipContent><p>Save current transcript and audio</p></TooltipContent>
            </Tooltip>
            <Tooltip>
                <TooltipTrigger asChild>
                <Button onClick={handleDownloadTranscript} disabled={!canDownload} variant="outline" aria-label="Download Transcript">
                    <Download className="h-5 w-5" /> 
                    <span className="ml-2 hidden sm:inline">Download TXT</span>
                </Button>
                </TooltipTrigger>
                <TooltipContent><p>Download transcript as .txt</p></TooltipContent>
            </Tooltip>
            {isDiarizing && (
            <div className="flex items-center text-sm text-muted-foreground ml-auto">
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
        <CardTitle className="text-xl flex items-center"><Search className="mr-2 h-6 w-6 text-primary" />Smart Case Search</CardTitle>
        <CardDescription>Search the active transcript for keywords, phrases, or legal references.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 flex-grow overflow-auto p-4">
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
            {isSearching ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />} 
            <span className="ml-2 hidden sm:inline">Search</span>
          </Button>
        </div>
        {searchError && (
          <div className="text-red-600 p-3 bg-red-100 dark:bg-red-900/30 dark:text-red-400 border border-red-300 dark:border-red-700 rounded-md flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" /> {searchError}
          </div>
        )}
        {searchResults ? (
          searchResults.searchResults.length > 0 ? (
            <div className="space-y-3 p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-md">
                <h3 className="font-semibold text-lg text-primary">Search Results:</h3>
                <p className="text-sm italic text-muted-foreground">{searchResults.summary}</p>
                <ScrollArea className="h-60 border rounded-md p-2 bg-background"> 
                    <ul className="list-disc list-inside space-y-1 text-sm pl-2">
                    {searchResults.searchResults.map((result, index) => (
                        <li key={index} className="py-1 border-b border-border last:border-b-0">{result}</li>
                    ))}
                    </ul>
                </ScrollArea>
            </div>
            ) : (
                <div className="text-center py-8 text-muted-foreground">
                    <Search className="w-16 h-16 mb-4 mx-auto opacity-50" />
                    <p>No results found for "{searchTerm}".</p>
                    <p className="text-xs mt-1">{searchResults.summary}</p>
                </div>
            )
        ) : isSearching ? (
             <div className="text-center py-8 text-muted-foreground">
                <Loader2 className="w-12 h-12 mb-4 mx-auto animate-spin text-primary" />
                <p>Searching...</p>
            </div>
        ) : (
             <div className="text-center py-8 text-muted-foreground">
                <Search className="w-16 h-16 mb-4 mx-auto opacity-30" />
                <p>Enter a term to search the current transcript.</p>
            </div>
        )}
      </CardContent>
      <CardFooter className="border-t p-4 bg-muted/50">
        <p className="text-xs text-muted-foreground">Search results are powered by AI for contextual understanding.</p>
      </CardFooter>
    </Card>
  );

  const renderSettingsView = () => (
    <Card className="shadow-lg h-full">
      <CardHeader>
        <CardTitle className="text-xl flex items-center"><Settings className="mr-2 h-6 w-6 text-primary" />Application Settings</CardTitle>
        <CardDescription>Configure application preferences (Most are placeholders).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 p-4">
        <div className="p-4 border rounded-md bg-card">
          <h3 className="text-lg font-semibold mb-2 text-primary">Audio Configuration</h3>
          <p className="text-sm text-muted-foreground">Input/output device selection, noise cancellation options, etc. (Placeholder)</p>
        </div>
        <div className="p-4 border rounded-md bg-card">
          <h3 className="text-lg font-semibold mb-2 text-primary">Transcription Models</h3>
          <p className="text-sm text-muted-foreground">Select custom language models or dictionaries for legal terms. (Placeholder)</p>
        </div>
        <div className="p-4 border rounded-md bg-card">
          <h3 className="text-lg font-semibold mb-2 text-primary">Data Storage</h3>
          <p className="text-sm text-muted-foreground">Manage cloud or local storage options, backup, and archiving. (Placeholder)</p>
        </div>
         <div className="p-4 border rounded-md bg-card">
          <h3 className="text-lg font-semibold mb-2 text-primary">Theme</h3>
          <p className="text-sm text-muted-foreground">Dark mode is automatically handled by your system preference. The application uses a responsive theme defined in <code className="text-xs bg-muted p-1 rounded">globals.css</code>.</p>
        </div>
      </CardContent>
    </Card>
  );

  const renderUserProfileView = () => (
     <Card className="shadow-lg h-full">
      <CardHeader>
        <CardTitle className="text-xl flex items-center"><UserCircle className="mr-2 h-6 w-6 text-primary" />User Profile</CardTitle>
        <CardDescription>Manage your profile information (Placeholder).</CardDescription>
      </CardHeader>
      <CardContent className="p-4">
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8 border rounded-md bg-card">
            <UserCircle className="w-24 h-24 mb-6 opacity-50" />
            <p className="text-center">User authentication and profile management features will be available here in a future update.</p>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar side="left" variant="sidebar" collapsible="icon" className="border-r shadow-md">
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
        <SidebarFooter className="p-2 border-t mt-auto">
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

      <SidebarInset className={`flex flex-col transition-all duration-300 ease-in-out ${sidebarOpen ? "md:ml-[16rem]" : "md:ml-[3rem]"}`}>
        <header className={`flex items-center justify-between mb-0 md:mb-0 md:h-14 sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b ${activeView === 'liveSession' ? 'hidden' : ''}`}>
            <div className={`p-2 md:p-4 md:hidden ${sidebarOpen ? 'invisible': ''}`}> 
                <AppLogo />
            </div>
            <div className={`ml-auto p-2 md:p-4 md:hidden ${sidebarOpen ? 'hidden': ''}`}> 
                <SidebarTrigger />
            </div>
             <div className="hidden md:flex items-center p-4 w-full">
                 <h2 className="text-xl font-semibold text-primary">
                    {activeView === 'recordings' && "Saved Sessions"}
                    {activeView === 'transcriptions' && "Manage Active Transcript"}
                    {activeView === 'searchCases' && "Smart Case Search"}
                    {activeView === 'settings' && "Application Settings"}
                    {activeView === 'userProfile' && "User Profile"}
                 </h2>
                  <div className="ml-auto md:hidden"> {/* Ensure sidebar trigger is visible on mobile when header is shown */}
                    <SidebarTrigger/>
                  </div>
             </div>
        </header>
        
        <main className={`flex-grow overflow-auto ${activeView === 'liveSession' ? 'p-0' : 'p-0 md:p-4'}`}>
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
         {activeView !== 'liveSession' && (
            <footer className="w-full mt-auto p-3 text-center text-xs text-muted-foreground border-t bg-muted/30">
                <p>&copy; {new Date().getFullYear()} VeriCourt (Naija Lawscribe). All rights reserved.</p>
                <p className="mt-1">Built with modern AI for Nigerian legal professionals.</p>
            </footer>
         )}
      </SidebarInset>
    </div>
  );
}

