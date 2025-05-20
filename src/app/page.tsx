
'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mic, Pause, Square, Save, Search, Loader2, AlertTriangle, CheckCircle2, FileText, Trash2, Download, Users, History, Edit3, ListOrdered } from 'lucide-react';
import { AppLogo } from '@/components/layout/AppLogo';
import { transcribeAudioAction, searchTranscriptAction, diarizeTranscriptAction } from './actions';
import type { SmartSearchInput, SmartSearchOutput } from '@/ai/flows/smart-search';
import type { DiarizeTranscriptInput, DiarizedSegment } from '@/ai/flows/diarize-transcript-flow';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

type RecordingState = 'idle' | 'recording' | 'paused';

interface SavedTranscript {
  id: string;
  timestamp: number;
  title: string;
  rawTranscript: string;
  diarizedTranscript: DiarizedSegment[] | null;
  audioDataUri: string | null;
}

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
  const [activeTab, setActiveTab] = useState<string>("record");


  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const transcriptScrollAreaRef = useRef<HTMLDivElement>(null);

  const { toast } = useToast();

  useEffect(() => {
    const storedTranscripts = localStorage.getItem('naijaLawScribeTranscripts');
    if (storedTranscripts) {
      setSavedTranscripts(JSON.parse(storedTranscripts));
    }
  }, []);

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

  const handleDiarizeTranscript = useCallback(async () => {
    if (isDiarizing) {
      toast({ title: 'Diarization in Progress', description: 'Please wait for the current diarization to complete.', variant: 'default' });
      return;
    }
    const audioForDiarization = currentRecordingFullAudioUri || loadedAudioUri;
    if (!audioForDiarization || !rawTranscript.trim()) {
      // This specific toast might be too early if called automatically before user context is fully clear.
      // Consider if automatic calls should silently skip or have a different notification.
      // For now, keeping it, as manual button still exists.
      if (!currentRecordingFullAudioUri && !loadedAudioUri) { // Only show if not implicitly handled by automatic flow start
         toast({ title: 'Diarization Error', description: 'Full audio and raw transcript are required for diarization.', variant: 'destructive' });
      }
      return;
    }
    setIsDiarizing(true);
    try {
      const input: DiarizeTranscriptInput = { audioDataUri: audioForDiarization, rawTranscript };
      const response = await diarizeTranscriptAction(input);
      if (response.segments) {
        setDiarizedTranscript(response.segments);
        toast({ title: 'Diarization Complete', description: 'Transcript has been segmented by speaker.', icon: <CheckCircle2 className="h-5 w-5 text-green-500" /> });
      } else if (response.error) {
        toast({ title: 'Diarization Failed', description: response.error, variant: 'destructive' });
        setDiarizedTranscript(null); // Clear any partial/failed diarization
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An unknown error occurred during diarization.';
      toast({ title: 'Diarization Exception', description: message, variant: 'destructive' });
      setDiarizedTranscript(null); // Clear any partial/failed diarization
    } finally {
      setIsDiarizing(false);
    }
  }, [isDiarizing, currentRecordingFullAudioUri, loadedAudioUri, rawTranscript, toast]);


  const handleStartRecording = async () => {
    if (recordingState === 'idle' || recordingState === 'paused') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm' });

        mediaRecorderRef.current.ondataavailable = async (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
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
        };
        
        mediaRecorderRef.current.onstart = () => {
          setRecordingState('recording');
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
              setActiveTab("manage-session"); 
              // Automatically trigger diarization if conditions met
              if (rawTranscript.trim() && audioDataUri) {
                // Wrapped in a timeout to allow state updates to propagate for handleDiarizeTranscript's checks
                setTimeout(() => handleDiarizeTranscript(), 0); 
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
    setCurrentRecordingFullAudioUri(null); // Clear any live recording audio URI
    setCurrentSessionTitle(selectedTranscript.title); 
    setActiveTab("manage-session");
    toast({ title: 'Transcript Loaded', description: `"${selectedTranscript.title}" is now active.` });

    // Automatically trigger diarization if conditions met
    if (audioToLoad && selectedTranscript.rawTranscript.trim() && !selectedTranscript.diarizedTranscript) {
       // Wrapped in a timeout to allow state updates to propagate for handleDiarizeTranscript's checks
      setTimeout(() => handleDiarizeTranscript(), 0);
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

  // Manual diarization trigger function is now just `handleDiarizeTranscript` (already defined with useCallback)

  useEffect(() => {
    if (transcriptScrollAreaRef.current && (rawTranscript || diarizedTranscript)) {
        const scrollElement = transcriptScrollAreaRef.current.querySelector('div[data-radix-scroll-area-viewport]');
        if (scrollElement) {
            scrollElement.scrollTop = scrollElement.scrollHeight;
        }
    }
  }, [rawTranscript, diarizedTranscript]);


  const getMicIconSized = (size = "h-5 w-5") => {
    if (recordingState === 'recording') {
      return <Mic className={`${size} text-red-500 animate-pulse`} />;
    }
    return <Mic className={size} />;
  };
  
  const canManuallyDiarize = recordingState === 'idle' && !!rawTranscript.trim() && !!(currentRecordingFullAudioUri || loadedAudioUri) && !diarizedTranscript && !isDiarizing;
  const canSave = recordingState === 'idle' && (!!rawTranscript.trim() || !!diarizedTranscript);
  const canDownload = recordingState === 'idle' && (!!rawTranscript.trim() || !!diarizedTranscript);


  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center p-4 md:p-8 selection:bg-accent selection:text-accent-foreground">
      <header className="w-full max-w-5xl mb-6">
        <AppLogo />
      </header>

      <main className="w-full max-w-5xl space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 mb-4">
            <TabsTrigger value="record" className="text-xs sm:text-sm">
              <Mic className="mr-2 h-4 w-4" /> Record
            </TabsTrigger>
            <TabsTrigger value="manage-session" className="text-xs sm:text-sm" disabled={!currentRecordingFullAudioUri && !loadedAudioUri && !rawTranscript.trim()}>
              <Edit3 className="mr-2 h-4 w-4" /> Manage Session
            </TabsTrigger>
            <TabsTrigger value="search" className="text-xs sm:text-sm" disabled={!rawTranscript.trim() && !diarizedTranscript}>
              <Search className="mr-2 h-4 w-4" /> Search
            </TabsTrigger>
            <TabsTrigger value="load-saved" className="text-xs sm:text-sm">
              <History className="mr-2 h-4 w-4" /> Load Saved
            </TabsTrigger>
          </TabsList>

          <TabsContent value="record">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="text-xl flex items-center">
                  {getMicIconSized("h-6 w-6 mr-2")} Courtroom Recorder
                </CardTitle>
                <CardDescription>Start, pause, or stop audio recording for live transcription.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2 items-center">
                  {recordingState === 'idle' && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button onClick={handleStartRecording} className="bg-green-600 hover:bg-green-700 text-white" aria-label="Start Recording">
                          {getMicIconSized()} Start Recording
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent><p>Begin audio recording and live transcription</p></TooltipContent>
                    </Tooltip>
                  )}
                  {recordingState === 'recording' && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button onClick={handlePauseRecording} variant="outline" className="border-yellow-500 text-yellow-600 hover:bg-yellow-50" aria-label="Pause Recording">
                          <Pause className="h-5 w-5" /> Pause
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent><p>Pause audio recording</p></TooltipContent>
                    </Tooltip>
                  )}
                  {recordingState === 'paused' && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button onClick={handleResumeRecording} variant="outline" className="border-green-500 text-green-600 hover:bg-green-50" aria-label="Resume Recording">
                          {getMicIconSized()} Resume
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent><p>Resume audio recording</p></TooltipContent>
                    </Tooltip>
                  )}
                  {(recordingState === 'recording' || recordingState === 'paused') && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button onClick={handleStopRecording} variant="destructive" aria-label="Stop Recording">
                          <Square className="h-5 w-5" /> Stop
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent><p>Stop audio recording and finalize raw transcript</p></TooltipContent>
                    </Tooltip>
                  )}
                </div>
                {(isTranscribingChunk || (recordingState === 'recording' && !isTranscribingChunk)) && (
                  <div className="flex items-center text-sm text-muted-foreground pt-2">
                    {isTranscribingChunk ? 
                      <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Transcribing audio chunk...</> :
                      <><Mic className="h-4 w-4 text-red-500 animate-pulse mr-2" /> Listening...</>
                    }
                  </div>
                )}
              </CardContent>
              <CardFooter>
                <p className="text-xs text-muted-foreground">Recording will be chunked for live transcription. Full audio and automatic diarization available after stopping.</p>
              </CardFooter>
            </Card>
             <Card className="shadow-lg mt-6">
                <CardHeader>
                    <CardTitle className="text-xl">Live Transcription Feed</CardTitle>
                    <CardDescription>Raw text as it's being transcribed. Scroll to bottom for latest.</CardDescription>
                </CardHeader>
                <CardContent>
                    <ScrollArea ref={transcriptScrollAreaRef} className="h-60 w-full rounded-md border p-4 bg-muted/30">
                        <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">
                        {rawTranscript || <span className="text-muted-foreground">Waiting for recording to start...</span>}
                        </pre>
                    </ScrollArea>
                </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="manage-session">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="text-xl flex items-center"><FileText className="mr-2 h-6 w-6" />Session Management</CardTitle>
                <CardDescription>Review, diarize, save, or download the current transcript and audio. Diarization attempts to run automatically.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {(currentRecordingFullAudioUri || loadedAudioUri) && (
                  <div>
                    <h3 className="text-lg font-semibold mb-2">Audio Playback</h3>
                    <audio 
                      key={loadedAudioUri || currentRecordingFullAudioUri} 
                      controls 
                      src={loadedAudioUri || currentRecordingFullAudioUri || undefined} 
                      className="w-full rounded-md shadow"
                    >
                      Your browser does not support the audio element.
                    </audio>
                  </div>
                )}
                <div>
                    <div className="flex justify-between items-center mb-2">
                         <h3 className="text-lg font-semibold">
                            {diarizedTranscript ? "Diarized Transcript" : "Raw Transcript"}
                         </h3>
                         {diarizedTranscript && <ListOrdered className="h-5 w-5 text-primary" />}
                         {isDiarizing && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
                    </div>
                  <ScrollArea ref={transcriptScrollAreaRef} className="h-72 w-full rounded-md border p-4 bg-muted/30">
                    {diarizedTranscript ? (
                      <div className="space-y-3">
                        {diarizedTranscript.map((segment, index) => (
                          <div key={index}>
                            <strong className="text-primary">{segment.speaker}:</strong>
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
                         <span className="text-muted-foreground">No transcript available. Record or load a session.</span>
                    )}
                  </ScrollArea>
                </div>
                 <div className="flex flex-wrap gap-2 items-center pt-4 border-t">
                    <Tooltip>
                        <TooltipTrigger asChild>
                        <Button onClick={handleDiarizeTranscript} disabled={!canManuallyDiarize} variant="outline" aria-label="Diarize Transcript Manually">
                            {isDiarizing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Users className="h-5 w-5" />} Diarize Manually
                        </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>Manually re-run speaker identification if needed</p></TooltipContent>
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
                 </div>
                 {isDiarizing && (
                    <div className="flex items-center text-sm text-muted-foreground pt-2">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        <span>Identifying speakers... This may take a few moments.</span>
                    </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="search">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="text-xl flex items-center"><Search className="mr-2 h-6 w-6" />Smart Search</CardTitle>
                <CardDescription>Search the current transcript for keywords, phrases, or legal references.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
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
                    <ScrollArea className="h-60">
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
          </TabsContent>

          <TabsContent value="load-saved">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="text-xl flex items-center"><History className="mr-2 h-6 w-6" />Saved Sessions</CardTitle>
                <CardDescription>Load or delete previously saved court proceeding transcripts and audio.</CardDescription>
              </CardHeader>
              <CardContent>
                {savedTranscripts.length > 0 ? (
                  <ScrollArea className="h-96">
                    <ul className="space-y-2">
                      {savedTranscripts.sort((a,b) => b.timestamp - a.timestamp).map(st => (
                        <li key={st.id} className="flex flex-col sm:flex-row justify-between sm:items-center p-3 border rounded-md hover:bg-muted/50 transition-colors">
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
                                  <FileText className="h-4 w-4"/> Load
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent><p>Load this session</p></TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="destructive" size="sm" onClick={() => handleDeleteSavedTranscript(st.id)} aria-label={`Delete ${st.title}`}>
                                  <Trash2 className="h-4 w-4"/> Delete
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
                  <p className="text-muted-foreground text-center py-8">No saved sessions yet.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

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
        
      </main>
      <footer className="w-full max-w-5xl mt-12 text-center text-sm text-muted-foreground">
        <Separator className="my-4"/>
        <p>&copy; {new Date().getFullYear()} Naija Lawscribe. All rights reserved.</p>
        <p className="mt-1">Built with modern AI for Nigerian legal professionals.</p>
      </footer>
    </div>
  );
}

    
