'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Mic, Pause, Square, Save, Search, Loader2, AlertTriangle, CheckCircle2, FileText, Trash2, Download } from 'lucide-react';
import { AppLogo } from '@/components/layout/AppLogo';
import { transcribeAudioAction, searchTranscriptAction } from './actions';
import type { SmartSearchInput, SmartSearchOutput } from '@/ai/flows/smart-search';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';


type RecordingState = 'idle' | 'recording' | 'paused';
interface SavedTranscript {
  id: string;
  timestamp: number;
  text: string;
  title: string;
}

export default function CourtProceedingsPage() {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [transcript, setTranscript] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<SmartSearchOutput | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isTranscribingChunk, setIsTranscribingChunk] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [savedTranscripts, setSavedTranscripts] = useState<SavedTranscript[]>([]);
  const [currentSessionTitle, setCurrentSessionTitle] = useState<string>('');
  const [showSaveDialog, setShowSaveDialog] = useState<boolean>(false);


  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const transcriptScrollAreaRef = useRef<HTMLDivElement>(null);

  const { toast } = useToast();

  useEffect(() => {
    // Load saved transcripts from localStorage on mount
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

  const handleStartRecording = async () => {
    if (recordingState === 'idle' || recordingState === 'paused') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorderRef.current = new MediaRecorder(stream);

        mediaRecorderRef.current.ondataavailable = async (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
            // Transcribe chunk immediately
            setIsTranscribingChunk(true);
            try {
              const audioBlob = new Blob([event.data], { type: event.data.type || 'audio/webm' });
              const audioDataUri = await blobToDataURI(audioBlob);
              const result = await transcribeAudioAction(audioDataUri);
              if (result.transcription) {
                setTranscript((prev) => prev + result.transcription + ' ');
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
          audioChunksRef.current = []; // Clear previous chunks
          if (recordingState === 'idle') setTranscript(''); // Clear transcript only if starting fresh
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
          // Stop all tracks on the stream
          stream.getTracks().forEach(track => track.stop());
          mediaRecorderRef.current = null;
          toast({ title: 'Recording Stopped', icon: <Square className="h-5 w-5 text-red-500" /> });
        };
        
        // Start recording with timeslice to get data in chunks (e.g., every 5 seconds)
        // This helps with "live" feel but might hit API limits or be costly.
        // For more robust live, a streaming STT API would be better.
        // Genkit's current `media` helper might not support streaming audio input directly.
        // This implementation sends chunks as individual files.
        mediaRecorderRef.current.start(5000); // Capture 5-second chunks

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
    if (!transcript.trim()) {
      toast({ title: "Cannot Save", description: "Transcript is empty.", variant: "destructive" });
      return;
    }
    const now = new Date();
    const suggestedTitle = `Court Session - ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    setCurrentSessionTitle(suggestedTitle);
    setShowSaveDialog(true);
  };

  const handleConfirmSave = async () => {
    if (!currentSessionTitle.trim()) {
      toast({ title: "Invalid Title", description: "Please enter a title for the session.", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    // Simulate saving delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    const newSavedTranscript: SavedTranscript = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      text: transcript,
      title: currentSessionTitle,
    };
    persistSavedTranscripts([newSavedTranscript, ...savedTranscripts]);
    
    setIsSaving(false);
    setShowSaveDialog(false);
    setCurrentSessionTitle(''); // Reset for next save
    // Optionally clear current transcript after saving
    // setTranscript('');
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
    setTranscript(selectedTranscript.text);
    setCurrentSessionTitle(selectedTranscript.title); // For potential re-save
    toast({ title: 'Transcript Loaded', description: `"${selectedTranscript.title}" is now active.` });
  };

  const handleSearch = async () => {
    if (!searchTerm.trim() || !transcript.trim()) {
      toast({ title: 'Search Error', description: 'Please enter a search term and ensure there is a transcript to search.', variant: 'destructive' });
      return;
    }
    setIsSearching(true);
    setSearchError(null);
    setSearchResults(null);
    try {
      const input: SmartSearchInput = { transcription: transcript, searchTerm };
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
    if (!transcript.trim()) {
      toast({ title: "Cannot Download", description: "Transcript is empty.", variant: "destructive" });
      return;
    }
    const title = currentSessionTitle || `Transcript-${new Date().toISOString()}`;
    const blob = new Blob([transcript], { type: 'text/plain;charset=utf-8' });
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
    if (transcriptScrollAreaRef.current) {
      const scrollElement = transcriptScrollAreaRef.current.querySelector('div[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  }, [transcript]);

  const getMicIcon = () => {
    if (recordingState === 'recording') {
      return <Mic className="h-5 w-5 text-red-500 animate-pulse" />;
    }
    return <Mic className="h-5 w-5" />;
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center p-4 md:p-8 selection:bg-accent selection:text-accent-foreground">
      <header className="w-full max-w-4xl mb-6">
        <AppLogo />
      </header>

      <main className="w-full max-w-4xl space-y-6">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl">Courtroom Recorder</CardTitle>
            <CardDescription>Record, transcribe, and manage court proceedings.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2 items-center">
              {recordingState === 'idle' && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button onClick={handleStartRecording} className="bg-green-600 hover:bg-green-700 text-white" aria-label="Start Recording">
                      {getMicIcon()} Start Recording
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p>Begin audio recording</p></TooltipContent>
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
                      {getMicIcon()} Resume
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
                  <TooltipContent><p>Stop audio recording</p></TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={handleInitiateSave} disabled={isSaving || recordingState !== 'idle' || !transcript.trim()} variant="secondary" aria-label="Save Transcript">
                    {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />} Save
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Save current transcript</p></TooltipContent>
              </Tooltip>
               <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={handleDownloadTranscript} disabled={recordingState !== 'idle' || !transcript.trim()} variant="outline" aria-label="Download Transcript">
                    <Download className="h-5 w-5" /> Download TXT
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Download transcript as .txt</p></TooltipContent>
              </Tooltip>
            </div>
            {isTranscribingChunk && (
              <div className="flex items-center text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span>Transcribing audio chunk...</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save Current Session</DialogTitle>
              <DialogDescription>
                Enter a title for this court proceeding session.
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

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl">Live Transcription</CardTitle>
            <CardDescription>The transcribed text will appear below in real-time.</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea ref={transcriptScrollAreaRef} className="h-72 w-full rounded-md border p-4 bg-muted/30">
              <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">
                {transcript || <span className="text-muted-foreground">Waiting for transcription...</span>}
              </pre>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl">Smart Search</CardTitle>
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
              <Button onClick={handleSearch} disabled={isSearching || !transcript.trim() || !searchTerm.trim()} aria-label="Search Transcript">
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
                <ul className="list-disc list-inside space-y-1 text-sm pl-2">
                  {searchResults.searchResults.map((result, index) => (
                    <li key={index} className="py-1 border-b border-border last:border-b-0">{result}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
        
        {savedTranscripts.length > 0 && (
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="text-xl">Saved Sessions</CardTitle>
              <CardDescription>Load or delete previously saved court proceeding transcripts.</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-60">
                <ul className="space-y-2">
                  {savedTranscripts.map(st => (
                    <li key={st.id} className="flex justify-between items-center p-3 border rounded-md hover:bg-muted/50 transition-colors">
                      <div>
                        <p className="font-medium">{st.title}</p>
                        <p className="text-xs text-muted-foreground">{new Date(st.timestamp).toLocaleString()}</p>
                      </div>
                      <div className="flex gap-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="outline" size="sm" onClick={() => handleLoadSavedTranscript(st)} aria-label={`Load ${st.title}`}>
                              <FileText className="h-4 w-4"/>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent><p>Load this transcript</p></TooltipContent>
                        </Tooltip>
                         <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="destructive" size="sm" onClick={() => handleDeleteSavedTranscript(st.id)} aria-label={`Delete ${st.title}`}>
                              <Trash2 className="h-4 w-4"/>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent><p>Delete this transcript</p></TooltipContent>
                        </Tooltip>
                      </div>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </main>
      <footer className="w-full max-w-4xl mt-12 text-center text-sm text-muted-foreground">
        <Separator className="my-4"/>
        <p>&copy; {new Date().getFullYear()} Naija Lawscribe. All rights reserved.</p>
        <p className="mt-1">Built with modern AI for Nigerian legal professionals.</p>
      </footer>
    </div>
  );
}
