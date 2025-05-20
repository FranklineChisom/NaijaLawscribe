
'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Mic, Pause, Square, Save, Search, Loader2, AlertTriangle, CheckCircle2, FileText, Trash2, Download, Users, Settings, UserCircle, LayoutDashboard, FolderOpen, Edit, MessageSquare, Video, Palette, Landmark, Briefcase, Sigma, CircleHelp, FileAudio, Clock, Calendar, PlusCircle, ToggleLeft, ToggleRight, Headphones,
  Play, SkipBack, SkipForward, MicOff, Info, ListOrdered, UploadCloud, AudioLines, Volume2, Sun, Moon, Laptop, X, ListChecks, BookOpen, UserCheck, Tag
} from 'lucide-react';
import { transcribeAudioAction, searchTranscriptAction, diarizeTranscriptAction } from './actions';
import type { SmartSearchInput, SmartSearchOutput } from '@/ai/flows/smart-search';
import type { LiveTranscriptionInput } from '@/ai/flows/live-transcription';
import type { DiarizeTranscriptInput, DiarizedSegment } from '@/ai/flows/diarize-transcript-flow';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarInset, SidebarTrigger, SidebarFooter, useSidebar } from '@/components/ui/sidebar';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTheme } from '@/components/theme-provider';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuGroup, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { Badge } from '@/components/ui/badge';


type RecordingState = 'idle' | 'recording' | 'paused';
type ActiveView = 'liveSession' | 'recordings' | 'transcriptions' | 'searchCases' | 'settings' | 'userProfile';

interface Annotation {
  id: string;
  text: string;
  timestamp: number; // in seconds, relative to recording start
  tag?: string;
}
interface SavedTranscript {
  id: string;
  timestamp: number;
  title: string;
  rawTranscript: string;
  diarizedTranscript: DiarizedSegment[] | null;
  audioDataUri: string | null;
  judge?: string;
  hearingType?: string;
  courtroom?: string;
  participants?: string[];
  annotations?: Annotation[];
}


const speakerColors: { [key: string]: string } = {
  DEFAULT: 'text-foreground',
  THE_COURT: 'text-purple-600 dark:text-purple-400',
  JUDGE: 'text-blue-600 dark:text-blue-400',
  PROSECUTOR: 'text-orange-600 dark:text-orange-400',
  COUNSEL: 'text-red-600 dark:text-red-400',
  DEFENSE: 'text-red-600 dark:text-red-400',
  WITNESS: 'text-green-600 dark:text-green-400',
  PLAINTIFF: 'text-indigo-600 dark:text-indigo-400',
  DEFENDANT: 'text-pink-600 dark:text-pink-400',
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
    const colorKeys = Object.keys(speakerColors).filter(k => k !== 'DEFAULT' && !['JUDGE', 'COUNSEL', 'WITNESS', 'PLAINTIFF', 'DEFENDANT', 'THE_COURT', 'PROSECUTOR'].includes(k));
    return colorKeys.length > 0 ? speakerColors[colorKeys[speakerNum % colorKeys.length]] : speakerColors.DEFAULT;
  }
  return speakerColors.DEFAULT;
};

const availableTags = ["Important", "Evidence", "Objection", "Ruling", "Question", "Testimony", "Argument", "Sidebar", "Hearsay", "Other"];
const quickTagsList = ["Testimony", "Objection", "Ruling", "Evidence", "Argument", "Sidebar", "Hearsay"];


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
  const [showClearStorageDialog, setShowClearStorageDialog] = useState<boolean>(false);

  const [currentRecordingFullAudioUri, setCurrentRecordingFullAudioUri] = useState<string | null>(null);
  const [loadedAudioUri, setLoadedAudioUri] = useState<string | null>(null);
  const [isPlayingPlayback, setIsPlayingPlayback] = useState<boolean>(false);

  const [activeView, setActiveView] = useState<ActiveView>('liveSession');
  const [elapsedTime, setElapsedTime] = useState<number>(0); // For recording timer and playback tracking
  const [playbackTime, setPlaybackTime] = useState<number>(0); // Specifically for audio element's current time
  const [audioDuration, setAudioDuration] = useState<number>(0); // For audio element's duration
  const [autoTranscription, setAutoTranscription] = useState<boolean>(true);
  const [currentDateTime, setCurrentDateTime] = useState<Date | null>(null);

  const [caseJudge, setCaseJudge] = useState<string>('');
  const [caseHearingType, setCaseHearingType] = useState<string>('');
  const [caseCourtroom, setCaseCourtroom] = useState<string>('');
  const [caseParticipants, setCaseParticipants] = useState<string[]>([]);
  const [newParticipantName, setNewParticipantName] = useState<string>('');

  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [newAnnotationText, setNewAnnotationText] = useState<string>('');
  const [selectedAnnotationTag, setSelectedAnnotationTag] = useState<string>('');
  const [showAllAnnotationsDialog, setShowAllAnnotationsDialog] = useState<boolean>(false);


  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputDevice, setSelectedInputDevice] = useState<string>('');
  const [selectedOutputDevice, setSelectedOutputDevice] = useState<string>('');
  const [noiseCancellationEnabled, setNoiseCancellationEnabled] = useState<boolean>(false);
  const [customLegalTerms, setCustomLegalTerms] = useState<string>('');

  const [waveformRandomValues, setWaveformRandomValues] = useState<number[]>([]);


  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const transcriptScrollAreaRef = useRef<HTMLDivElement>(null);
  const liveTranscriptScrollAreaRef = useRef<HTMLDivElement>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const dateTimeIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);


  const { toast } = useToast();
  const { open: sidebarOpen, state: sidebarState } = useSidebar();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setWaveformRandomValues(Array.from({ length: 80 }, () => Math.random()));
      setCurrentDateTime(new Date()); // Set initial date/time on client mount
      dateTimeIntervalRef.current = setInterval(() => {
        setCurrentDateTime(new Date());
      }, 1000 * 60); // Update every minute
    }

    const storedTranscripts = localStorage.getItem('naijaLawScribeTranscripts');
    if (storedTranscripts) {
      try {
        setSavedTranscripts(JSON.parse(storedTranscripts));
      } catch (e) {
        console.error("Failed to parse stored transcripts:", e);
        localStorage.removeItem('naijaLawScribeTranscripts');
      }
    }
    const storedCustomTerms = localStorage.getItem('naijaLawScribeCustomTerms');
    if (storedCustomTerms) {
      setCustomLegalTerms(storedCustomTerms);
    }

    return () => {
      if (dateTimeIntervalRef.current) clearInterval(dateTimeIntervalRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    const getAudioDevices = async () => {
      try {
        if (typeof navigator.mediaDevices?.getUserMedia !== 'function') {
            if (activeView === 'settings') {
                toast({ title: "Audio Device Error", description: "Media devices API not supported or not available in this context.", variant: "destructive"});
            }
            return;
        }
        await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        const devices = await navigator.mediaDevices.enumerateDevices();
        const inputs = devices.filter(device => device.kind === 'audioinput');
        const outputs = devices.filter(device => device.kind === 'audiooutput');
        setAudioInputDevices(inputs);
        setAudioOutputDevices(outputs);
        if (inputs.length > 0 && !selectedInputDevice) setSelectedInputDevice(inputs[0].deviceId);
        if (outputs.length > 0 && !selectedOutputDevice) setSelectedOutputDevice('default'); // 'default' is often a valid deviceId for output
      } catch (err) {
        console.error("Error enumerating audio devices or getting permissions:", err);
        if (activeView === 'settings') {
          toast({
              title: "Audio Device Error",
              description: "Could not access audio devices. Ensure microphone permissions are granted.",
              variant: "destructive",
          });
        }
      }
    };

    if (activeView === 'settings' || (recordingState === 'idle' && !mediaRecorderRef.current)) {
      getAudioDevices();
    }
  }, [activeView, toast, recordingState, selectedInputDevice, selectedOutputDevice]);


  useEffect(() => {
    if (recordingState === 'recording') {
      timerIntervalRef.current = setInterval(() => {
        setElapsedTime((prevTime) => prevTime + 1);
      }, 1000);
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    }
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [recordingState]);

  useEffect(() => {
    if (liveTranscriptScrollAreaRef.current && (rawTranscript || diarizedTranscript || isDiarizing)) {
      const scrollElement = liveTranscriptScrollAreaRef.current.querySelector('div[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  }, [rawTranscript, diarizedTranscript, isDiarizing, activeView]);

  useEffect(() => {
    if (transcriptScrollAreaRef.current && activeView === 'transcriptions' && (rawTranscript || diarizedTranscript)) {
        const scrollElement = transcriptScrollAreaRef.current.querySelector('div[data-radix-scroll-area-viewport]');
        if (scrollElement) {
            scrollElement.scrollTop = scrollElement.scrollHeight;
        }
    }
  }, [rawTranscript, diarizedTranscript, activeView]);


  const formatTime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${hours > 0 ? String(hours).padStart(2, '0') + ':' : ''}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const persistSavedTranscripts = (updatedTranscripts: SavedTranscript[]) => {
    setSavedTranscripts(updatedTranscripts);
    try {
      localStorage.setItem('naijaLawScribeTranscripts', JSON.stringify(updatedTranscripts));
    } catch (e) {
      console.error("Failed to save transcripts to localStorage:", e);
      toast({ title: "Storage Error", description: "Could not save transcripts locally.", variant: "destructive" });
    }
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

  const handleDiarizeTranscript = useCallback(async (audioUriToDiarize?: string, transcriptToDiarize?: string) => {
    const audioForDiarization = audioUriToDiarize || currentRecordingFullAudioUri || loadedAudioUri;
    const currentTranscript = transcriptToDiarize || rawTranscript;

    if (isDiarizing) {
      toast({ title: 'Diarization in Progress', description: 'Please wait for the current diarization to complete.', variant: 'default' });
      return;
    }
    if (!audioForDiarization || !currentTranscript.trim()) {
      const isExplicitAttempt = !!(audioUriToDiarize || transcriptToDiarize) ||
                                (activeView === 'transcriptions' && !!(currentRecordingFullAudioUri || loadedAudioUri)) ||
                                (activeView === 'liveSession' && (recordingState === 'idle' && (currentRecordingFullAudioUri || loadedAudioUri) && rawTranscript.trim()));
      if (isExplicitAttempt) {
          toast({ title: 'Diarization Skipped', description: 'Full audio and raw transcript are required.', variant: 'default' });
      }
      setDiarizedTranscript(null);
      return;
    }

    setIsDiarizing(true);
    setDiarizedTranscript(null);
    try {
      const input: DiarizeTranscriptInput = {
        audioDataUri: audioForDiarization,
        rawTranscript: currentTranscript,
        customTerms: customLegalTerms || undefined,
      };
      const response = await diarizeTranscriptAction(input);
      if (response.segments) {
        setDiarizedTranscript(response.segments);
        toast({ title: 'Diarization Complete', description: 'Transcript has been segmented by speaker.', icon: <CheckCircle2 className="h-5 w-5 text-green-500" /> });
      } else if (response.error) {
        toast({ title: 'Diarization Failed', description: response.error, variant: 'destructive' });
        setDiarizedTranscript([{speaker: "Error", text: "Diarization failed. Raw transcript retained."}]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An unknown error occurred during diarization.';
      toast({ title: 'Diarization Exception', description: message, variant: 'destructive' });
       setDiarizedTranscript([{speaker: "Error", text: "Diarization exception. Raw transcript retained."}]);
    } finally {
      setIsDiarizing(false);
    }
  }, [isDiarizing, currentRecordingFullAudioUri, loadedAudioUri, rawTranscript, toast, customLegalTerms, activeView, recordingState]);


  const handleStartRecording = async () => {
    if (typeof navigator.mediaDevices?.getUserMedia !== 'function') {
      toast({
        title: "Audio Feature Not Supported",
        description: "Your browser does not support the necessary audio recording features, or you are in an insecure context (non-HTTPS).",
        variant: "destructive",
      });
      return;
    }

    if (recordingState === 'idle' || recordingState === 'paused') {
      try {
        if(isPlayingPlayback && audioPlayerRef.current) {
            audioPlayerRef.current.pause();
            setIsPlayingPlayback(false);
        }

        const stream = await navigator.mediaDevices.getUserMedia({
            audio: selectedInputDevice ? { deviceId: { exact: selectedInputDevice } } : true
        });
        mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm' });

        mediaRecorderRef.current.ondataavailable = async (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
            if (autoTranscription && recordingState === 'recording') {
              setIsTranscribingChunk(true);
              try {
                const audioBlob = new Blob([event.data], { type: event.data.type || 'audio/webm' });
                const audioDataUri = await blobToDataURI(audioBlob);
                const transcriptionInput: LiveTranscriptionInput = {
                  audioDataUri,
                  customTerms: customLegalTerms || undefined,
                };
                const result = await transcribeAudioAction(transcriptionInput);
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
          const initialIdle = recordingState === 'idle';
          setRecordingState('recording');
          if(initialIdle) {
            setElapsedTime(0);
            setRawTranscript('');
            setDiarizedTranscript(null);
            setCurrentRecordingFullAudioUri(null);
            setLoadedAudioUri(null);
            setAnnotations([]);
            setCaseJudge('');
            setCaseHearingType('');
            setCaseCourtroom('');
            setCaseParticipants([]);
            audioChunksRef.current = [];
            if (currentSessionTitle === 'Untitled Session' || currentSessionTitle.startsWith('Court Session -')) {
                const now = new Date();
                setCurrentSessionTitle(`Court Session - ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
            }
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
          const previousState = recordingState;
          setRecordingState('idle');
          stream.getTracks().forEach(track => track.stop());

          if (previousState === 'recording' || previousState === 'paused') {
            toast({ title: 'Recording Stopped', icon: <Square className="h-5 w-5 text-red-500" /> });
          }

          if (audioChunksRef.current.length > 0) {
            const fullAudioBlob = new Blob(audioChunksRef.current, { type: audioChunksRef.current[0]?.type || 'audio/webm' });
            try {
              const audioDataUri = await blobToDataURI(fullAudioBlob);
              setCurrentRecordingFullAudioUri(audioDataUri);
              setLoadedAudioUri(audioDataUri);
              if (audioPlayerRef.current) {
                audioPlayerRef.current.src = audioDataUri;
                audioPlayerRef.current.load();
                audioPlayerRef.current.onloadedmetadata = () => {
                    if (audioPlayerRef.current) setAudioDuration(audioPlayerRef.current.duration);
                    setPlaybackTime(0);
                };
              }
              if (rawTranscript.trim() && audioDataUri && !diarizedTranscript) {
                setTimeout(() => handleDiarizeTranscript(audioDataUri, rawTranscript), 0);
              }
            } catch (error) {
              console.error("Error creating full audio URI:", error);
              toast({ title: 'Audio Processing Error', description: 'Failed to process full recording.', variant: 'destructive' });
            }
          }
          mediaRecorderRef.current = null;
        };

        if (recordingState === 'paused' && mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
             mediaRecorderRef.current.resume();
        } else {
            mediaRecorderRef.current.start(5000);
        }

      } catch (error) {
        console.error('Error accessing microphone:', error);
        toast({ title: 'Microphone Error', description: 'Could not access microphone. Please check permissions and selected device.', variant: 'destructive' });
      }
    }
  };

  const handlePauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
    }
  };

  const handleResumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
    } else {
      handleStartRecording();
    }
  };

  const handleStopRecordingOrPlayback = () => {
    if (mediaRecorderRef.current && (mediaRecorderRef.current.state === 'recording' || mediaRecorderRef.current.state === 'paused')) {
      mediaRecorderRef.current.stop();
    } else if (recordingState === 'idle' && isPlayingPlayback && audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
      setIsPlayingPlayback(false);
      setPlaybackTime(0);
      toast({ title: "Playback Stopped" });
    } else if (recordingState === 'idle' && (currentRecordingFullAudioUri || loadedAudioUri || rawTranscript || diarizedTranscript || currentSessionTitle !== 'Untitled Session' || caseJudge || caseHearingType || caseCourtroom || caseParticipants.length > 0 || annotations.length > 0)) {
      setRawTranscript('');
      setDiarizedTranscript(null);
      setCurrentRecordingFullAudioUri(null);
      setLoadedAudioUri(null);
      if (audioPlayerRef.current) {
        audioPlayerRef.current.src = '';
        audioPlayerRef.current.load();
        setAudioDuration(0);
      }
      setIsPlayingPlayback(false);
      setElapsedTime(0);
      setPlaybackTime(0);
      setCurrentSessionTitle('Untitled Session');
      setCaseJudge('');
      setCaseHearingType('');
      setCaseCourtroom('');
      setCaseParticipants([]);
      setAnnotations([]);
      audioChunksRef.current = [];
      toast({title: "Session Data Cleared", description: "Current audio, transcript, case details, and annotations have been cleared."});
    }
  };

  const toggleMainRecordingOrPlayback = () => {
    if (recordingState === 'recording') {
      handlePauseRecording();
    } else if (recordingState === 'paused') {
      handleResumeRecording();
    } else if (recordingState === 'idle') {
      if (currentRecordingFullAudioUri || loadedAudioUri) {
        if (audioPlayerRef.current) {
          if (isPlayingPlayback) {
            audioPlayerRef.current.pause();
          } else {
            audioPlayerRef.current.play().catch(e => {
                console.error("Playback error:", e);
                toast({title: "Playback Error", description: "Could not play audio.", variant: "destructive"});
            });
          }
        }
      } else {
        handleStartRecording();
      }
    }
  };

  const handleInitiateSave = () => {
    if (!rawTranscript.trim() && !diarizedTranscript && !currentRecordingFullAudioUri && !loadedAudioUri && annotations.length === 0 && currentSessionTitle === 'Untitled Session' && !caseJudge && !caseHearingType && !caseCourtroom && caseParticipants.length === 0) {
      toast({ title: "Cannot Save", description: "No data to save.", variant: "destructive" });
      return;
    }
    if (!currentSessionTitle.trim() || currentSessionTitle === "Untitled Session") {
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
      judge: caseJudge,
      hearingType: caseHearingType,
      courtroom: caseCourtroom,
      participants: caseParticipants,
      annotations: annotations,
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
    setCaseJudge(selectedTranscript.judge || '');
    setCaseHearingType(selectedTranscript.hearingType || '');
    setCaseCourtroom(selectedTranscript.courtroom || '');
    setCaseParticipants(selectedTranscript.participants || []);
    setAnnotations(selectedTranscript.annotations || []);
    setElapsedTime(0);
    setPlaybackTime(0);
    setIsPlayingPlayback(false);

    if (audioPlayerRef.current && audioToLoad) {
      audioPlayerRef.current.src = audioToLoad;
      audioPlayerRef.current.load();
      audioPlayerRef.current.onloadedmetadata = () => {
        if (audioPlayerRef.current) setAudioDuration(audioPlayerRef.current.duration);
        setPlaybackTime(0);
      };
    } else if (audioPlayerRef.current) {
      audioPlayerRef.current.src = '';
      audioPlayerRef.current.load();
      setAudioDuration(0);
    }

    toast({ title: 'Transcript Loaded', description: `"${selectedTranscript.title || "Untitled Session"}" is now active.` });
    setActiveView("liveSession");

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

  const handleExportTranscript = (format: 'txt' | 'csv' | 'pdf' | 'docx') => {
    const transcriptContentForTxt = diarizedTranscript
      ? diarizedTranscript.map(s => `${s.speaker}:\n${s.text}`).join('\n\n')
      : rawTranscript;

    if (format !== 'csv' && !transcriptContentForTxt.trim()) {
      toast({ title: "Cannot Export", description: "Transcript is empty.", variant: "destructive" });
      return;
    }
    if (format === 'csv' && !rawTranscript.trim() && (!diarizedTranscript || diarizedTranscript.length === 0)) {
        toast({ title: "Cannot Export CSV", description: "No transcript data available for CSV.", variant: "destructive" });
        return;
    }

    const title = (currentSessionTitle.trim() && currentSessionTitle !== "Untitled Session") ? currentSessionTitle : `Transcript-${new Date().toISOString().split('T')[0]}`;
    const sanitizedTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();

    let blob: Blob;
    let filename: string;
    let mimeType: string;

    switch (format) {
      case 'txt':
        filename = `${sanitizedTitle}.txt`;
        mimeType = 'text/plain;charset=utf-8';
        blob = new Blob([transcriptContentForTxt], { type: mimeType });
        break;
      case 'csv':
        filename = `${sanitizedTitle}.csv`;
        mimeType = 'text/csv;charset=utf-8';
        let csvHeader = "Timestamp (seconds),Speaker,Text\n";
        let csvContent = "";
        if (diarizedTranscript && diarizedTranscript.length > 0) {
          // Assuming annotations timestamps might be relevant if we align them.
          // For simplicity, if diarized, we just use speaker and text for now.
          // For accurate timestamped CSV, would need timing info per segment from diarization.
          // Placeholder: just speaker and text
          csvContent = diarizedTranscript
            .map(segment => `,"${segment.speaker.replace(/"/g, '""')}","${segment.text.replace(/"/g, '""')}"`) // Empty timestamp for now
            .join('\n');
        } else if (rawTranscript.trim()) {
          csvContent = `,"Unknown Speaker","${rawTranscript.replace(/"/g, '""')}"`;
        } else {
          toast({ title: "Cannot Export CSV", description: "No transcript data to export.", variant: "destructive" });
          return;
        }
        blob = new Blob([csvHeader + csvContent], { type: mimeType });
        break;
      case 'pdf':
        toast({ title: "PDF Export", description: "PDF export functionality is planned for a future update.", variant: "default" });
        return;
      case 'docx':
        toast({ title: "DOCX Export", description: "DOCX export functionality is planned for a future update.", variant: "default" });
        return;
      default:
        toast({ title: "Error", description: "Invalid export format.", variant: "destructive" });
        return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast({ title: 'Export Started', description: `"${filename}" is downloading.`, icon: <Download className="h-4 w-4" /> });
  };


  const canManuallyDiarize = recordingState === 'idle' && !!rawTranscript.trim() && !!(currentRecordingFullAudioUri || loadedAudioUri) && !isDiarizing;
  const canSave = recordingState === 'idle' && (!!rawTranscript.trim() || !!diarizedTranscript || !!currentRecordingFullAudioUri || !!loadedAudioUri || (currentSessionTitle !== 'Untitled Session' && currentSessionTitle.trim() !== '') || annotations.length > 0 || caseJudge.trim() !== '' || caseHearingType.trim() !== '' || caseCourtroom.trim() !== '' || caseParticipants.length > 0);
  const canDownload = recordingState === 'idle' && (!!rawTranscript.trim() || !!diarizedTranscript);

  const handleSaveCustomTerms = () => {
    try {
      localStorage.setItem('naijaLawScribeCustomTerms', customLegalTerms);
      toast({ title: 'Custom Terms Saved', description: 'Your custom legal terms have been saved locally.' });
    } catch (e) {
      console.error("Failed to save custom terms to localStorage:", e);
      toast({ title: "Storage Error", description: "Could not save custom terms.", variant: "destructive" });
    }
  };

  const handleClearLocalStorage = () => {
    try {
      localStorage.removeItem('naijaLawScribeTranscripts');
      localStorage.removeItem('naijaLawScribeCustomTerms');
      setSavedTranscripts([]);
      setCustomLegalTerms('');
      toast({ title: 'Local Storage Cleared', description: 'All saved sessions and custom terms have been removed from local storage.', variant: 'destructive' });
    } catch (e) {
      console.error("Failed to clear local storage:", e);
      toast({ title: "Storage Error", description: "Could not clear local storage.", variant: "destructive" });
    }
    setShowClearStorageDialog(false);
  };

  const handleAddParticipant = () => {
    if (newParticipantName.trim() && !caseParticipants.includes(newParticipantName.trim())) {
      setCaseParticipants([...caseParticipants, newParticipantName.trim()]);
      setNewParticipantName('');
    } else if (caseParticipants.includes(newParticipantName.trim())) {
      toast({ title: "Participant Exists", description: "This participant is already in the list.", variant: "default"});
    }
  };

  const handleRemoveParticipant = (participantToRemove: string) => {
    setCaseParticipants(caseParticipants.filter(p => p !== participantToRemove));
  };

  const handleAddAnnotation = () => {
    if (!newAnnotationText.trim()) {
      toast({title: "Cannot Add Note", description: "Note text cannot be empty.", variant: "destructive"});
      return;
    }
    let timestamp = 0;
    if (recordingState === 'recording' || recordingState === 'paused') {
      timestamp = elapsedTime;
    } else if (isPlayingPlayback && audioPlayerRef.current) {
      timestamp = audioPlayerRef.current.currentTime;
    }

    const newAnnotation: Annotation = {
      id: Date.now().toString(),
      text: newAnnotationText,
      timestamp: timestamp,
      tag: selectedAnnotationTag || undefined,
    };
    setAnnotations(prev => [...prev, newAnnotation].sort((a,b) => b.timestamp - a.timestamp));
    setNewAnnotationText('');
    setSelectedAnnotationTag(''); // Reset selected tag after adding
    toast({title: "Annotation Added", icon: <CheckCircle2 className="h-4 w-4 text-green-500"/>});
  };

  const handleAddQuickTag = (tag: string) => {
    let timestamp = 0;
    if (recordingState === 'recording' || recordingState === 'paused') {
      timestamp = elapsedTime;
    } else if (isPlayingPlayback && audioPlayerRef.current) {
      timestamp = audioPlayerRef.current.currentTime;
    }

    const newAnnotation: Annotation = {
      id: Date.now().toString(),
      text: tag,
      timestamp: timestamp,
      tag: tag,
    };
    setAnnotations(prev => [...prev, newAnnotation].sort((a,b) => b.timestamp - a.timestamp));
    toast({title: `Quick Tag Added: ${tag}`, icon: <Tag className="h-4 w-4 text-primary"/>});
  };


  const renderLiveSessionHeader = () => (
    <header className="bg-primary text-primary-foreground p-2 sm:p-3 shadow-md">
      <div className="container mx-auto flex flex-col sm:flex-row justify-between items-center gap-1 sm:gap-2">
        <h1 className="text-lg sm:text-xl md:text-2xl font-semibold text-center sm:text-left">Court Recording & Transcription</h1>
        <div className="flex items-center space-x-2 md:space-x-4 text-xs sm:text-sm">
          {currentDateTime ? (
            <>
              <span className="flex items-center"><Calendar className="mr-1 md:mr-2" size={16} /> {currentDateTime.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</span>
              <span className="flex items-center"><Clock className="mr-1 md:mr-2" size={16} /> {currentDateTime.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
            </>
          ) : (
            <>
              <span className="flex items-center"><Calendar className="mr-1 md:mr-2" size={16} /> Loading date...</span>
              <span className="flex items-center"><Clock className="mr-1 md:mr-2" size={16} /> Loading time...</span>
            </>
          )}
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

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Panel: Case Details - Full width on mobile, fixed on lg+ */}
        <div className="w-full lg:w-64 xl:w-72 bg-muted/30 p-2 md:p-3 border-b lg:border-b-0 lg:border-r order-1 lg:order-1 overflow-y-auto">
          <Card id="case-details-card" className="shadow-sm h-full">
            <CardHeader className="p-2 md:p-3">
              <CardTitle className="text-sm md:text-base">Case Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 md:space-y-3 text-xs md:text-sm px-2 md:px-3 pb-2 md:pb-3">
              <div>
                <Label htmlFor="case-title" className="text-xs text-muted-foreground">Case Title / Number</Label>
                <Input
                  id="case-title"
                  type="text"
                  value={currentSessionTitle}
                  onChange={(e) => setCurrentSessionTitle(e.target.value)}
                  placeholder="Enter case title or number..."
                  className="text-xs md:text-sm h-8 md:h-9 mt-1 bg-card"
                  disabled={recordingState !== 'idle'}
                  suppressHydrationWarning={true}
                />
              </div>
              <div>
                <Label htmlFor="case-judge" className="text-xs text-muted-foreground">Judge</Label>
                <Input
                  id="case-judge"
                  type="text"
                  value={caseJudge}
                  onChange={(e) => setCaseJudge(e.target.value)}
                  placeholder="Enter judge's name..."
                  className="text-xs md:text-sm h-8 md:h-9 mt-1 bg-card"
                  disabled={recordingState !== 'idle'}
                  suppressHydrationWarning={true}
                />
              </div>
              <div>
                <Label htmlFor="case-hearing-type" className="text-xs text-muted-foreground">Hearing Type</Label>
                <Input
                  id="case-hearing-type"
                  type="text"
                  value={caseHearingType}
                  onChange={(e) => setCaseHearingType(e.target.value)}
                  placeholder="e.g., Motion, Arraignment"
                  className="text-xs md:text-sm h-8 md:h-9 mt-1 bg-card"
                  disabled={recordingState !== 'idle'}
                  suppressHydrationWarning={true}
                />
              </div>
              <div>
                <Label htmlFor="case-courtroom" className="text-xs text-muted-foreground">Courtroom</Label>
                <Input
                  id="case-courtroom"
                  type="text"
                  value={caseCourtroom}
                  onChange={(e) => setCaseCourtroom(e.target.value)}
                  placeholder="Enter courtroom number/name"
                  className="text-xs md:text-sm h-8 md:h-9 mt-1 bg-card"
                  disabled={recordingState !== 'idle'}
                  suppressHydrationWarning={true}
                />
              </div>
              <Separator className="my-2 md:my-3" />
              <h3 className="font-semibold text-xs md:text-sm mb-1">Participants</h3>
              <div className="space-y-1.5 max-h-24 overflow-y-auto">
                {caseParticipants.map((participant, index) => (
                  <div key={index} className="flex items-center justify-between bg-card p-1.5 rounded border text-xs">
                    <span className="flex items-center"><UserCircle className="mr-1.5 text-primary" size={14} /> {participant}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 md:h-6 md:w-6 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemoveParticipant(participant)}
                      disabled={recordingState !== 'idle'}
                      aria-label={`Remove ${participant}`}
                    >
                      <X size={12} />
                    </Button>
                  </div>
                ))}
                 {caseParticipants.length === 0 && <p className="text-xs text-muted-foreground">No participants added.</p>}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Input
                  type="text"
                  value={newParticipantName}
                  onChange={(e) => setNewParticipantName(e.target.value)}
                  placeholder="Add participant name..."
                  className="text-xs h-8 flex-grow bg-card"
                  disabled={recordingState !== 'idle'}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddParticipant()}
                  suppressHydrationWarning={true}
                />
                <Button onClick={handleAddParticipant} size="sm" className="text-xs h-8 px-2" disabled={recordingState !== 'idle' || !newParticipantName.trim()}>
                  <PlusCircle size={14} className="mr-1"/> Add
                </Button>
              </div>
            </CardContent>
            <CardFooter className="flex-col space-y-2 p-2 md:p-3 border-t bg-muted/30">
               <Button onClick={handleInitiateSave} disabled={!canSave || isSaving} className="w-full text-xs md:text-sm h-8 md:h-9">
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save size={14} md={16} className="mr-2" />} Save Session
              </Button>
               <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full text-xs md:text-sm h-8 md:h-9" disabled={!canDownload}>
                    <Download size={14} md={16} className="mr-2" /> Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleExportTranscript('txt')} disabled={!canDownload}>
                    <FileText className="mr-2 h-4 w-4" /> TXT (.txt)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExportTranscript('csv')} disabled={!canDownload}>
                    <ListOrdered className="mr-2 h-4 w-4" /> CSV (.csv)
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleExportTranscript('pdf')} disabled={!canDownload}>
                    <FileText className="mr-2 h-4 w-4" /> PDF (.pdf)
                    <Badge variant="outline" className="ml-2 text-xs">Planned</Badge>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExportTranscript('docx')} disabled={!canDownload}>
                    <FileText className="mr-2 h-4 w-4" /> DOCX (.docx)
                    <Badge variant="outline" className="ml-2 text-xs">Planned</Badge>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </CardFooter>
          </Card>
        </div>

        {/* Middle Panel: Main Recording/Transcript - Full width on mobile, flex-1 on lg+ */}
        <div className="flex-1 flex flex-col overflow-hidden p-2 md:p-3 order-2 lg:order-2">
          <Card id="audio-recording-card" className="shadow-sm mb-2 md:mb-3">
            <CardHeader className="p-2 md:p-3">
              <div className="flex flex-col sm:flex-row items-center justify-between">
                <CardTitle className="text-sm md:text-base mb-1 sm:mb-0">Audio Recording</CardTitle>
                <div className="flex items-center text-xs">
                  <span className={`inline-block w-2 h-2 sm:w-2.5 sm:h-2.5 ${recordingState === 'recording' ? 'bg-red-500 animate-pulse' : recordingState === 'paused' ? 'bg-yellow-500' : (isPlayingPlayback ? 'bg-green-500' : 'bg-muted-foreground')} rounded-full mr-1.5`}></span>
                  <span className="capitalize">{isPlayingPlayback ? 'Playing' : (recordingState === 'idle' && (loadedAudioUri || currentRecordingFullAudioUri) ? "Stopped" : recordingState)}</span>
                  <span className="ml-2 sm:ml-3 font-mono tabular-nums">
                    { (recordingState === 'recording' || recordingState === 'paused') ? formatTime(elapsedTime) : (loadedAudioUri || currentRecordingFullAudioUri) ? `${formatTime(playbackTime)} / ${formatTime(audioDuration)}` : "00:00" }
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-2 md:p-3">
              <div className="flex-1 flex items-center justify-center my-1 md:my-2">
                <div className="w-full">
                  <div className="relative w-full h-20 sm:h-24 md:h-28 bg-muted/30 rounded-md">
                    <div className="absolute inset-0 flex items-center justify-center px-0.5 sm:px-1 overflow-hidden">
                      {waveformRandomValues.length === 80 && Array.from({ length: 80 }).map((_, i) => {
                          const isActiveBar = (recordingState === 'recording' || isPlayingPlayback);
                          // const currentProgressPercent = isPlayingPlayback ? (playbackTime / audioDuration) * 100 : (elapsedTime % 80) / 80 * 100;
                          const barIsActive = isActiveBar && i < (isPlayingPlayback ? (playbackTime / audioDuration) * 80 : (elapsedTime * (80 / (audioDuration||60) )) % 80 ) ; // Crude approximation for recording progress bar display

                          const randomHeightFactor = waveformRandomValues[i] || 0.5;
                          const actualRandomHeight = randomHeightFactor * 60 + 20;
                          const dynamicHeight = (isActiveBar && recordingState !== 'paused')
                                                ? actualRandomHeight
                                                : (recordingState === 'paused' ? 30 : 15);
                        return (
                          <div
                            key={i}
                            className={`mx-px rounded-sm transition-all duration-150 ease-out ${ recordingState === 'paused' ? 'bg-yellow-500/50' : (barIsActive ? 'bg-primary' : 'bg-primary/50')}`}
                            style={{
                              height: `${dynamicHeight}%`,
                              width: 'calc(100% / 80 - 1px)',
                            }}
                            suppressHydrationWarning={true}
                          />
                        );
                      })}
                    </div>
                     {(loadedAudioUri || currentRecordingFullAudioUri) && recordingState === 'idle' && (
                        <audio
                          ref={audioPlayerRef}
                          src={loadedAudioUri || currentRecordingFullAudioUri || undefined}
                          className="w-full hidden" // Hidden: custom controls used
                          onPlay={() => setIsPlayingPlayback(true)}
                          onPause={() => setIsPlayingPlayback(false)}
                          onEnded={() => {
                              setIsPlayingPlayback(false);
                              if (audioPlayerRef.current) audioPlayerRef.current.currentTime = 0;
                              setPlaybackTime(0);
                          }}
                          onTimeUpdate={() => {
                              if (audioPlayerRef.current) {
                                  setPlaybackTime(audioPlayerRef.current.currentTime);
                              }
                          }}
                          onLoadedMetadata={() => {
                              if (audioPlayerRef.current) {
                                  setAudioDuration(audioPlayerRef.current.duration);
                                  setPlaybackTime(0);
                              }
                          }}
                          suppressHydrationWarning={true}
                        />
                      )}
                        {!(currentRecordingFullAudioUri || loadedAudioUri) && (
                          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs sm:text-sm">
                              {recordingState === 'recording' ? "Recording in progress..." : recordingState === 'paused' ? "Recording paused..." : "Press Play to start recording."}
                          </div>
                      )}
                      {(currentRecordingFullAudioUri || loadedAudioUri) && !isPlayingPlayback && recordingState === 'idle' && (
                            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs sm:text-sm">
                              Press Play to listen to the recording.
                          </div>
                        )}
                  </div>
                </div>
              </div>

              <div className="flex justify-center items-center space-x-1 sm:space-x-2 mt-2 md:mt-3">
                <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" disabled className="text-muted-foreground h-8 w-8 sm:h-9 sm:w-9"><SkipBack size={16} /></Button></TooltipTrigger><TooltipContent><p>Previous Segment (Disabled)</p></TooltipContent></Tooltip>
                <Button
                  id="main-record-play-pause-button"
                  onClick={toggleMainRecordingOrPlayback}
                  size="icon"
                  className={`p-2 sm:p-2.5 rounded-full ${recordingState === 'recording' ? 'bg-red-600 hover:bg-red-700' : (recordingState === 'paused' || isPlayingPlayback) ? 'bg-yellow-500 hover:bg-yellow-600 text-yellow-foreground' : 'bg-primary hover:bg-primary/90'} text-primary-foreground w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14`}
                  aria-label={recordingState === 'recording' ? "Pause Recording" : (recordingState === 'paused' || isPlayingPlayback) ? (isPlayingPlayback ? "Pause Playback" : "Resume Recording") : ((loadedAudioUri || currentRecordingFullAudioUri) ? "Play Recording" : "Start Recording")}
                >
                  {(recordingState === 'recording' || isPlayingPlayback) ? <Pause size={18} sm={20} md={24} /> : <Play size={18} sm={20} md={24} />}
                </Button>
                {((recordingState === 'recording' || recordingState === 'paused') || (isPlayingPlayback && (loadedAudioUri || currentRecordingFullAudioUri))) && (
                    <Button
                      id="main-record-stop-button"
                      onClick={handleStopRecordingOrPlayback} variant="destructive" size="icon" className="p-2 sm:p-2.5 rounded-full border-destructive text-destructive-foreground hover:bg-destructive/90 w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14"
                      aria-label={(recordingState === 'recording' || recordingState === 'paused') ? "Stop Recording" : "Stop Playback"}>
                      <Square size={18} sm={20} md={24}/>
                    </Button>
                )}
                  {(recordingState === 'idle' && !isPlayingPlayback && (rawTranscript || diarizedTranscript || currentRecordingFullAudioUri || loadedAudioUri || currentSessionTitle !== 'Untitled Session' || caseJudge || caseHearingType || caseCourtroom || caseParticipants.length > 0 || annotations.length > 0)) && (
                      <Button onClick={handleStopRecordingOrPlayback} variant="outline" size="icon" className="p-2 sm:p-2.5 rounded-full w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14" aria-label="Clear Current Session Data">
                          <Trash2 size={18} sm={20} md={24}/>
                      </Button>
                  )}
                <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" disabled className="text-muted-foreground h-8 w-8 sm:h-9 sm:w-9"><SkipForward size={16} /></Button></TooltipTrigger><TooltipContent><p>Next Segment (Disabled)</p></TooltipContent></Tooltip>
              </div>

              <div className="flex flex-col sm:flex-row justify-between items-center mt-2 md:mt-3 text-xs">
                <div className="flex items-center mb-2 sm:mb-0">
                  <Button variant="outline" size="sm" className="mr-2 h-7 sm:h-8" disabled>
                    {(recordingState !== 'idle' || isPlayingPlayback) ? <Mic size={12} sm={14} className="text-green-500" /> : <MicOff size={12} sm={14} />}
                    <span className="ml-1">{(recordingState !== 'idle') ? "Mic Active" : (isPlayingPlayback ? "Audio Playing" : "Mic Off")}</span>
                  </Button>
                    <div className="flex items-center space-x-1 sm:space-x-2">
                      <Switch id="auto-transcription-toggle" checked={autoTranscription} onCheckedChange={setAutoTranscription} disabled={recordingState !== 'idle'} />
                      <Label htmlFor="auto-transcription-toggle" className="text-xs">Auto Transcribe</Label>
                    </div>
                </div>
                <div className="flex space-x-1 sm:space-x-2 mt-2 sm:mt-0">
                  <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={() => setActiveView('settings')} className="h-7 w-7 sm:h-8 sm:w-8"><Headphones size={14} sm={16}/></Button></TooltipTrigger><TooltipContent><p>Audio Settings</p></TooltipContent></Tooltip>
                  <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" disabled className="text-muted-foreground h-7 w-7 sm:h-8 sm:w-8"><Info size={14} sm={16} /></Button></TooltipTrigger><TooltipContent><p>Session Info (Placeholder)</p></TooltipContent></Tooltip>
                </div>
              </div>
                {(isTranscribingChunk || (recordingState === 'recording' && !isTranscribingChunk && autoTranscription)) && (
                  <div className="mt-1 md:mt-2 text-xs text-muted-foreground flex items-center">
                    {isTranscribingChunk ?
                      <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Transcribing audio chunk...</> :
                      <><Mic className="h-3 w-3 text-red-500 animate-pulse mr-1" /> Listening...</>
                    }
                  </div>
                )}
            </CardContent>
          </Card>

          <Card id="real-time-transcript-card" className="flex-1 shadow-sm overflow-hidden">
             <CardHeader className="p-2 md:p-3">
                <div className="flex flex-col sm:flex-row items-center justify-between">
                  <CardTitle className="text-sm md:text-base mb-1 sm:mb-0">Real-time Transcript</CardTitle>
                  <div className="relative w-full sm:w-auto mt-1 sm:mt-0">
                    <Input
                      type="text"
                      placeholder="Search transcript..."
                      value={transcriptSearchTerm}
                      onChange={(e) => setTranscriptSearchTerm(e.target.value)}
                      className="pl-7 sm:pl-8 pr-3 sm:pr-4 py-1 text-xs sm:text-sm h-8 md:h-9 w-full sm:w-48 md:w-56 bg-card border-border focus:border-primary"
                      suppressHydrationWarning={true}
                    />
                    <Search size={12} sm={14} className="absolute left-2 sm:left-2.5 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                  </div>
                </div>
             </CardHeader>
            <CardContent className="h-full p-0">
              <ScrollArea ref={liveTranscriptScrollAreaRef} className="h-[calc(100vh-420px)] sm:h-[calc(100vh-400px)] md:h-[calc(100vh-350px)] lg:h-full w-full rounded-b-md"> {/* Adjusted height for better fit within card */}
                <div className="p-2 md:p-3 space-y-2 md:space-y-3 font-mono text-xs sm:text-sm leading-relaxed">
                  {diarizedTranscript ? (
                      diarizedTranscript.map((segment, index) => (
                        (!transcriptSearchTerm || segment.text.toLowerCase().includes(transcriptSearchTerm.toLowerCase()) || segment.speaker.toLowerCase().includes(transcriptSearchTerm.toLowerCase())) && (
                          <div key={index}>
                            <strong className={`${getSpeakerColor(segment.speaker)} font-semibold`}>{segment.speaker}:</strong>
                            <p className="whitespace-pre-wrap ml-1 sm:ml-2">{segment.text}</p>
                          </div>
                        )
                      ))
                  ) : rawTranscript ? (
                    <pre className="whitespace-pre-wrap">
                      {(!transcriptSearchTerm || rawTranscript.toLowerCase().includes(transcriptSearchTerm.toLowerCase())) ? rawTranscript : <span className="text-muted-foreground">No matches for "{transcriptSearchTerm}" in raw transcript.</span>}
                    </pre>
                  ) : (
                        <span className="text-muted-foreground">Waiting for recording or transcription...</span>
                  )}
                  {isDiarizing && <div className="flex items-center text-muted-foreground"><Loader2 className="inline h-3 w-3 sm:h-4 sm:w-4 animate-spin mr-1" /> Identifying speakers...</div>}
                  {recordingState === 'recording' && autoTranscription && !isTranscribingChunk && (
                    <div className="flex items-center animate-pulse text-muted-foreground">
                      <div className="h-1 w-1 sm:h-1.5 sm:w-1.5 rounded-full bg-primary mr-1 animate-ping delay-75"></div>
                      <div className="h-1 w-1 sm:h-1.5 sm:w-1.5 rounded-full bg-primary mr-1 animate-ping delay-150"></div>
                      <div className="h-1 w-1 sm:h-1.5 sm:w-1.5 rounded-full bg-primary animate-ping delay-300"></div>
                      <span className="ml-1 text-xs">Transcribing...</span>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Right Panel: Annotations - Full width on mobile, fixed on lg+ */}
        <div className="w-full lg:w-64 xl:w-72 bg-muted/30 p-2 md:p-3 border-t lg:border-t-0 lg:border-l order-3 lg:order-3 overflow-y-auto">
          <Card id="annotations-card" className="shadow-sm h-full">
            <CardHeader className="p-2 md:p-3">
              <CardTitle className="text-sm md:text-base">Annotations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 md:space-y-3 text-xs md:text-sm px-2 md:px-3 pb-2 md:pb-3">
              <div className="mb-2 md:mb-3">
                <Label htmlFor="annotation-text" className="block text-xs font-medium text-muted-foreground mb-1">Add Note</Label>
                <Textarea
                  id="annotation-text"
                  className="w-full border rounded-md p-2 text-xs md:text-sm bg-card focus:border-primary"
                  rows={2}
                  placeholder="Add note about current moment..."
                  value={newAnnotationText}
                  onChange={(e) => setNewAnnotationText(e.target.value)}
                />
                  <div className="mt-1.5 md:mt-2">
                    <Label htmlFor="annotation-tag" className="block text-xs font-medium text-muted-foreground mb-1">Tag (Optional)</Label>
                    <Select value={selectedAnnotationTag} onValueChange={setSelectedAnnotationTag}>
                        <SelectTrigger id="annotation-tag" className="h-8 md:h-9 text-xs bg-card">
                            <SelectValue placeholder="Select tag..." />
                        </SelectTrigger>
                        <SelectContent>
                            {availableTags.map(tag => (
                                <SelectItem key={tag} value={tag} className="text-xs">{tag}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex justify-end mt-1.5 md:mt-2">
                  <Button size="sm" className="text-xs h-7 md:h-8" onClick={handleAddAnnotation} disabled={!newAnnotationText.trim()}>Add Note</Button>
                </div>
              </div>

              <Separator className="my-2 md:my-3"/>
              <h3 className="font-medium text-xs md:text-sm text-primary">Recent Annotations</h3>
              {annotations.length > 0 ? (
                <ScrollArea className="h-32 sm:h-36">
                  <div className="space-y-1.5 md:space-y-2">
                  {annotations.slice(0, 5).map(ann => (
                    <div key={ann.id} className="bg-card p-1.5 md:p-2 rounded border text-xs shadow-sm">
                      {ann.tag && <Badge variant="secondary" className="mb-1 text-xs">{ann.tag}</Badge>}
                      <p className="text-xs text-muted-foreground mb-0.5">Time: {formatTime(ann.timestamp)}</p>
                      <p className="mt-1 whitespace-pre-wrap">{ann.text}</p>
                    </div>
                  ))}
                  </div>
                </ScrollArea>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-2 sm:py-3">No annotations yet.</p>
              )}

              <div className="mt-2 md:mt-3">
                <h3 className="font-medium text-xs md:text-sm text-primary mb-1.5 md:mb-2">Quick Tags</h3>
                  <div className="flex flex-wrap gap-1 sm:gap-1.5">
                      {quickTagsList.map(tag => (
                          <Button key={tag} variant="outline" size="sm" className="text-xs px-2 py-1 h-6 sm:h-7" onClick={() => handleAddQuickTag(tag)}>
                            <Tag size={10} sm={12} className="mr-1"/> {tag}
                          </Button>
                      ))}
                  </div>
              </div>
            </CardContent>
              <CardFooter className="p-2 md:p-3 border-t bg-muted/30">
                <Button variant="outline" className="w-full text-xs md:text-sm h-8 md:h-9" onClick={() => setShowAllAnnotationsDialog(true)} disabled={annotations.length === 0}>
                    <ListChecks size={12} sm={14} className="mr-1.5"/> View All Notes ({annotations.length})
                </Button>
            </CardFooter>
          </Card>
        </div>
      </div>

      <footer className="bg-muted/50 p-2 border-t">
        <div className="container mx-auto flex flex-col sm:flex-row justify-between items-center text-xs text-muted-foreground gap-1 sm:gap-2">
            <div className="flex items-center">
            <span className={`inline-block w-1.5 h-1.5 sm:w-2 sm:h-2 ${recordingState !== 'idle' || isPlayingPlayback ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground'} rounded-full mr-1.5`}></span>
            <span>System: {recordingState !== 'idle' || isPlayingPlayback ? 'Active' : 'Online'}</span>
            </div>
            <div className="flex flex-wrap justify-center sm:justify-end gap-x-2 sm:gap-x-3 gap-y-1">
            <span>Storage: Local</span>
            <span>Backup: N/A</span>
            </div>
        </div>
      </footer>
    </div>
  );

  const renderRecordingsView = () => (
    <Card className="shadow-lg h-full flex flex-col">
      <CardHeader className="p-2 md:p-4">
        <CardTitle className="text-base md:text-xl flex items-center"><FolderOpen className="mr-2 h-5 w-5 md:h-6 md:w-6 text-primary" />Saved Sessions</CardTitle>
        <CardDescription className="text-xs md:text-sm">Load or delete previously saved court proceeding transcripts, audio, and annotations.</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow overflow-auto p-2 md:p-3">
        {savedTranscripts.length > 0 ? (
          <ScrollArea className="h-full max-h-[calc(100vh-160px)] md:max-h-[calc(100vh-180px)]">
            <ul className="space-y-2">
              {savedTranscripts.sort((a,b) => b.timestamp - a.timestamp).map(st => (
                <li key={st.id} className="flex flex-col sm:flex-row justify-between sm:items-center p-2 md:p-3 border rounded-md hover:bg-muted/50 transition-colors shadow-sm bg-card">
                  <div className="mb-2 sm:mb-0 flex-grow mr-2">
                    <p className="font-medium text-sm md:text-base break-words">{st.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(st.timestamp).toLocaleString()}
                      {st.diarizedTranscript ? ' (Diarized)' : ' (Raw transcript)'}
                      {st.audioDataUri ? ' (Audio)' : ''}
                      {st.annotations && st.annotations.length > 0 ? ` (${st.annotations.length} notes)` : ''}
                    </p>
                  </div>
                  <div className="flex gap-2 mt-2 sm:mt-0 flex-shrink-0">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="sm" onClick={() => handleLoadSavedTranscript(st)} aria-label={`Load ${st.title}`} className="text-xs h-8 px-2.5">
                          <FileText className="h-3.5 w-3.5 mr-1"/> Load
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent><p>Load this session</p></TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="destructive" size="sm" onClick={() => handleDeleteSavedTranscript(st.id)} aria-label={`Delete ${st.title}`} className="text-xs h-8 px-2.5">
                          <Trash2 className="h-3.5 w-3.5 mr-1"/> Delete
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
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
            <FolderOpen className="w-10 h-10 md:w-16 md:h-16 mb-3 md:mb-4 opacity-50" />
            <p className="text-center text-sm md:text-base">No saved sessions yet.</p>
            <p className="text-xs md:text-sm text-center mt-1">Recordings from the 'Live Session' tab can be saved here.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const renderTranscriptionsView = () => (
     <Card className="shadow-lg h-full flex flex-col">
      <CardHeader className="p-2 md:p-4">
        <CardTitle className="text-base md:text-xl flex items-center">
            <ListOrdered className="mr-2 h-5 w-5 md:h-6 md:w-6 text-primary" />
            Active Transcript: <span className="ml-1.5 md:ml-2 font-normal text-sm md:text-lg break-all">{currentSessionTitle || "Untitled Session"}</span>
        </CardTitle>
        <CardDescription className="text-xs md:text-sm">Review the current transcript. Diarization attempts to run automatically if audio is available. Use controls to save or download.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 md:space-y-4 flex-grow overflow-auto p-2 md:p-3">
        {(currentRecordingFullAudioUri || loadedAudioUri) && (
          <div>
            <h3 className="text-sm md:text-base font-semibold mb-1 md:mb-1.5 text-primary">Audio Playback</h3>
             <audio
                ref={el => {
                  if (el && activeView === 'transcriptions') audioPlayerRef.current = el;
                }}
                src={loadedAudioUri || currentRecordingFullAudioUri || undefined}
                controls // Show controls here for simplicity, or implement custom for this view too
                className="w-full rounded-md shadow-sm"
                onPlay={() => setIsPlayingPlayback(true)}
                onPause={() => setIsPlayingPlayback(false)}
                onEnded={() => setIsPlayingPlayback(false)}
                onLoadedMetadata={() => { if (audioPlayerRef.current) setAudioDuration(audioPlayerRef.current.duration); }}
                onTimeUpdate={() => { if (audioPlayerRef.current) setPlaybackTime(audioPlayerRef.current.currentTime);}}
                suppressHydrationWarning={true}
             >
                Your browser does not support the audio element.
            </audio>
          </div>
        )}
        <div>
            <div className="flex justify-between items-center mb-1 md:mb-1.5">
                 <h3 className="text-sm md:text-base font-semibold text-primary">
                    {diarizedTranscript ? "Diarized Transcript" : "Raw Transcript"}
                 </h3>
                 <div className="flex items-center gap-2">
                    {diarizedTranscript && <Users className="h-4 w-4 md:h-5 md:w-5 text-primary" />}
                    {isDiarizing && <Loader2 className="h-4 w-4 md:h-5 md:w-5 animate-spin text-primary" />}
                 </div>
            </div>
          <ScrollArea ref={transcriptScrollAreaRef} className="h-[calc(100vh-320px)] sm:h-[calc(100vh-340px)] md:h-[calc(100vh-360px)] w-full rounded-md border p-2 md:p-3 bg-muted/30">
            {diarizedTranscript ? (
              <div className="space-y-2 md:space-y-3 font-mono text-xs md:text-sm leading-relaxed">
                {diarizedTranscript.map((segment, index) => (
                  <div key={index}>
                    <strong className={`${getSpeakerColor(segment.speaker)} font-semibold`}>{segment.speaker}:</strong>
                    <p className="whitespace-pre-wrap ml-1 sm:ml-2">{segment.text}</p>
                  </div>
                ))}
              </div>
            ) : rawTranscript ? (
              <pre className="text-xs md:text-sm whitespace-pre-wrap font-mono leading-relaxed">
                {rawTranscript}
                {isDiarizing && !diarizedTranscript && <span className="block mt-2 text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin mr-1" /> Attempting automatic diarization...</span>}
              </pre>
            ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
                    <FileText className="w-10 h-10 md:w-16 md:h-16 mb-3 md:mb-4 opacity-50" />
                    <span className="text-center text-sm md:text-base">No transcript available.</span>
                    <span className="text-center text-xs md:text-sm mt-1">Record a new session or load one.</span>
                </div>
            )}
          </ScrollArea>
        </div>
      </CardContent>
       <CardFooter className="border-t p-2 md:p-3 flex flex-wrap gap-2 items-center bg-muted/50">
            <Tooltip>
                <TooltipTrigger asChild>
                <Button onClick={() => handleDiarizeTranscript(currentRecordingFullAudioUri || loadedAudioUri, rawTranscript)} disabled={!canManuallyDiarize} variant="outline" aria-label="Diarize Transcript Manually" size="sm" className="h-8 px-2.5">
                    {isDiarizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                    <span className="ml-1.5 hidden sm:inline">Diarize</span>
                </Button>
                </TooltipTrigger>
                <TooltipContent><p>Manually re-run speaker identification</p></TooltipContent>
            </Tooltip>
            <Tooltip>
                <TooltipTrigger asChild>
                <Button onClick={handleInitiateSave} disabled={!canSave || isSaving} aria-label="Save Transcript" size="sm" className="h-8 px-2.5">
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                     <span className="ml-1.5 hidden sm:inline">Save Session</span>
                </Button>
                </TooltipTrigger>
                <TooltipContent><p>Save current transcript and audio</p></TooltipContent>
            </Tooltip>
             <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" disabled={!canDownload} size="sm" className="h-8 px-2.5">
                    <Download size={14} className="mr-1" /> <span className="hidden sm:inline">Export</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleExportTranscript('txt')} disabled={!canDownload}>
                    <FileText className="mr-2 h-4 w-4" /> TXT (.txt)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExportTranscript('csv')} disabled={!canDownload}>
                    <ListOrdered className="mr-2 h-4 w-4" /> CSV (.csv)
                  </DropdownMenuItem>
                   <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleExportTranscript('pdf')} disabled={!canDownload}>
                    <FileText className="mr-2 h-4 w-4" /> PDF (.pdf) <Badge variant="outline" className="ml-2 text-xs">Planned</Badge>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExportTranscript('docx')} disabled={!canDownload}>
                    <FileText className="mr-2 h-4 w-4" /> DOCX (.docx) <Badge variant="outline" className="ml-2 text-xs">Planned</Badge>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            {isDiarizing && (
            <div className="flex items-center text-xs text-muted-foreground ml-auto">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span>Identifying speakers...</span>
            </div>
            )}
        </CardFooter>
    </Card>
  );

  const renderSearchView = () => (
    <Card className="shadow-lg h-full flex flex-col">
      <CardHeader className="p-2 md:p-4">
        <CardTitle className="text-base md:text-xl flex items-center"><Search className="mr-2 h-5 w-5 md:h-6 md:w-6 text-primary" />Smart Case Search</CardTitle>
        <CardDescription className="text-xs md:text-sm">Search the active transcript for keywords, phrases, or legal references.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 md:space-y-4 flex-grow overflow-auto p-2 md:p-3">
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder="Enter search term..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-grow h-9 text-sm"
            aria-label="Search Term"
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            suppressHydrationWarning={true}
          />
          <Button onClick={handleSearch} disabled={isSearching || (!rawTranscript.trim() && !diarizedTranscript) || !searchTerm.trim()} aria-label="Search Transcript" className="h-9 px-3">
            {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            <span className="ml-2 hidden sm:inline text-sm">Search</span>
          </Button>
        </div>
        {searchError && (
          <div className="text-destructive-foreground p-2.5 bg-destructive/80 border border-destructive rounded-md flex items-center gap-2 text-xs md:text-sm">
            <AlertTriangle className="h-4 w-4" /> {searchError}
          </div>
        )}
        {searchResults ? (
          searchResults.searchResults.length > 0 ? (
            <div className="space-y-2 md:space-y-3 p-2 md:p-3 bg-primary/10 border border-primary/30 rounded-md">
                <h3 className="font-semibold text-sm md:text-lg text-primary">Search Results:</h3>
                <p className="text-xs md:text-sm italic text-muted-foreground">{searchResults.summary}</p>
                <ScrollArea className="h-40 md:h-60 border rounded-md p-2 bg-background">
                    <ul className="list-disc list-inside space-y-1 text-xs md:text-sm pl-2">
                    {searchResults.searchResults.map((result, index) => (
                        <li key={index} className="py-1 border-b border-border last:border-b-0">{result}</li>
                    ))}
                    </ul>
                </ScrollArea>
            </div>
            ) : (
                <div className="text-center py-4 md:py-6 text-muted-foreground">
                    <Search className="w-8 h-8 md:w-14 md:h-14 mb-2 md:mb-3 mx-auto opacity-50" />
                    <p className="text-sm md:text-base">No results found for "{searchTerm}".</p>
                    <p className="text-xs mt-1">{searchResults.summary || "Please try a different term."}</p>
                </div>
            )
        ) : isSearching ? (
             <div className="text-center py-4 md:py-6 text-muted-foreground">
                <Loader2 className="w-6 h-6 md:w-10 md:h-10 mb-2 md:mb-3 mx-auto animate-spin text-primary" />
                <p>Searching...</p>
            </div>
        ) : (
             <div className="text-center py-4 md:py-6 text-muted-foreground">
                <Search className="w-8 h-8 md:w-14 md:h-14 mb-2 md:mb-3 mx-auto opacity-30" />
                <p className="text-sm md:text-base">Enter a term to search the current active transcript.</p>
            </div>
        )}
      </CardContent>
      <CardFooter className="border-t p-2 md:p-3 bg-muted/50">
        <p className="text-xs text-muted-foreground">Search results are powered by AI for contextual understanding.</p>
      </CardFooter>
    </Card>
  );

 const renderSettingsView = () => (
    <Card className="shadow-lg h-full">
      <CardHeader className="p-2 md:p-4">
        <CardTitle className="text-base md:text-xl flex items-center"><Settings className="mr-2 h-5 w-5 md:h-6 md:w-6 text-primary" />Application Settings</CardTitle>
        <CardDescription className="text-xs md:text-sm">Configure application preferences.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-2 md:p-3 overflow-y-auto max-h-[calc(100vh-140px)] md:max-h-[calc(100vh-160px)]">
        <div className="p-2 md:p-3 border rounded-md bg-card shadow-sm">
          <h3 className="text-sm md:text-lg font-semibold mb-2 text-primary flex items-center"><Headphones className="mr-2 h-4 md:h-5 w-4 md:w-5" />Audio Configuration</h3>
          <div className="space-y-3">
            <div>
              <Label htmlFor="audio-input-select" className="text-xs md:text-sm font-medium">Audio Input Device</Label>
              <Select value={selectedInputDevice} onValueChange={setSelectedInputDevice} disabled={recordingState !== 'idle'}>
                <SelectTrigger id="audio-input-select" className="mt-1 h-8 md:h-9 text-xs md:text-sm">
                  <SelectValue placeholder="Select input device..." />
                </SelectTrigger>
                <SelectContent>
                  {audioInputDevices.length > 0 ? audioInputDevices.map(device => (
                    <SelectItem key={device.deviceId} value={device.deviceId} className="text-xs md:text-sm">
                      {device.label || `Input Device ${device.deviceId.substring(0,8)}`}
                    </SelectItem>
                  )) : <SelectItem value="no-input" disabled className="text-xs md:text-sm">No input devices found. Grant mic permission.</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="audio-output-select" className="text-xs md:text-sm font-medium">Audio Output Device (System Controlled)</Label>
              <Select value={selectedOutputDevice} onValueChange={setSelectedOutputDevice} disabled>
                <SelectTrigger id="audio-output-select" className="mt-1 h-8 md:h-9 text-xs md:text-sm">
                  <SelectValue placeholder={audioOutputDevices.find(d=>d.deviceId === 'default')?.label || "System Default Output"} />
                </SelectTrigger>
                <SelectContent>
                  {audioOutputDevices.length > 0 ? audioOutputDevices.map(device => (
                    <SelectItem key={device.deviceId} value={device.deviceId} className="text-xs md:text-sm">
                      {device.label || `Output Device ${device.deviceId.substring(0,8)}`}
                    </SelectItem>
                  )) : <SelectItem value="no-output" disabled className="text-xs md:text-sm">No output devices found</SelectItem>}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Note: Output device selection is typically controlled by your OS/browser.</p>
            </div>
            <div className="flex items-center justify-between pt-1">
              <Label htmlFor="noise-cancellation-switch" className="text-xs md:text-sm font-medium">Enable Noise Cancellation (Placeholder)</Label>
              <Switch
                id="noise-cancellation-switch"
                checked={noiseCancellationEnabled}
                onCheckedChange={setNoiseCancellationEnabled}
                disabled // Placeholder
              />
            </div>
             <p className="text-xs text-muted-foreground">Actual noise cancellation is a future enhancement.</p>
          </div>
        </div>

        <div className="p-2 md:p-3 border rounded-md bg-card shadow-sm">
          <h3 className="text-sm md:text-lg font-semibold mb-2 text-primary flex items-center"><FileText className="mr-2 h-4 md:h-5 w-4 md:w-5" />Transcription Models</h3>
          <div className="space-y-3">
             <div>
                <Label htmlFor="custom-legal-terms" className="text-xs md:text-sm font-medium">Custom Legal Terms & Jargon</Label>
                <Textarea
                    id="custom-legal-terms"
                    placeholder="Enter terms, one per line or comma-separated (e.g., res ipsa loquitur, voir dire, Obong Effiong Bassey)"
                    value={customLegalTerms}
                    onChange={(e) => setCustomLegalTerms(e.target.value)}
                    className="mt-1 text-xs md:text-sm"
                    rows={3}
                />
                <p className="text-xs text-muted-foreground mt-1">These terms will be prioritized by the AI during transcription and diarization. Saved locally in your browser.</p>
                 <Button onClick={handleSaveCustomTerms} size="sm" className="mt-2 text-xs h-8 px-2.5">
                    <Save className="mr-2 h-3.5 w-3.5"/> Save Custom Terms
                </Button>
            </div>
            <Button variant="outline" disabled className="w-full justify-start text-left text-xs md:text-sm h-8 md:h-9">
              <Sigma className="mr-2 h-4 w-4" /> Select Language Model (Default - Placeholder)
            </Button>
             <Button variant="outline" disabled className="w-full justify-start text-left text-xs md:text-sm h-8 md:h-9">
              <PlusCircle className="mr-2 h-4 w-4" /> Upload Custom Dictionary (Placeholder)
            </Button>
          </div>
        </div>

        <div className="p-2 md:p-3 border rounded-md bg-card shadow-sm">
            <h3 className="text-sm md:text-lg font-semibold mb-2 text-primary flex items-center"><Palette className="mr-2 h-4 md:h-5 w-4 md:w-5" />Theme</h3>
            <RadioGroup value={theme} onValueChange={(value) => setTheme(value as 'light' | 'dark' | 'system')} className="text-xs md:text-sm space-y-1.5">
                <div className="flex items-center space-x-2">
                    <RadioGroupItem value="light" id="theme-light" />
                    <Label htmlFor="theme-light" className="flex items-center gap-2"><Sun size={14} md={16}/> Light</Label>
                </div>
                <div className="flex items-center space-x-2">
                    <RadioGroupItem value="dark" id="theme-dark" />
                    <Label htmlFor="theme-dark" className="flex items-center gap-2"><Moon size={14} md={16}/> Dark</Label>
                </div>
                <div className="flex items-center space-x-2">
                    <RadioGroupItem value="system" id="theme-system" />
                    <Label htmlFor="theme-system" className="flex items-center gap-2"><Laptop size={14} md={16}/> System</Label>
                </div>
            </RadioGroup>
            <p className="text-xs text-muted-foreground mt-2">Select your preferred application theme. Your choice is saved locally.</p>
        </div>

        <div className="p-2 md:p-3 border rounded-md bg-card shadow-sm">
          <h3 className="text-sm md:text-lg font-semibold mb-2 text-primary flex items-center"><UploadCloud className="mr-2 h-4 md:h-5 w-4 md:w-5"/>Data Storage</h3>
           <p className="text-xs md:text-sm text-muted-foreground mb-2">Saved sessions and custom terms are currently stored in your browser's local storage.</p>
            <AlertDialog open={showClearStorageDialog} onOpenChange={setShowClearStorageDialog}>
                <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" className="text-xs h-8 px-2.5">
                        <Trash2 className="mr-2 h-3.5 w-3.5"/> Clear All Saved Data (Local)
                    </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete all saved sessions and custom legal terms from your browser's local storage.
                    </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleClearLocalStorage}>Continue</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <Button variant="outline" disabled className="mt-2 w-full justify-start text-left text-xs md:text-sm h-8 md:h-9">
              <Briefcase className="mr-2 h-4 w-4"/> Configure Cloud Storage (Placeholder)
            </Button>
            <Button variant="outline" disabled className="mt-2 w-full justify-start text-left text-xs md:text-sm h-8 md:h-9">
               <Clock className="mr-2 h-4 w-4"/> Backup & Archiving Settings (Placeholder)
            </Button>
          <p className="text-xs text-muted-foreground mt-2">Cloud storage options are a future enhancement.</p>
        </div>
      </CardContent>
    </Card>
  );


  const renderUserProfileView = () => (
     <Card className="shadow-lg h-full">
      <CardHeader className="p-2 md:p-4">
        <CardTitle className="text-base md:text-xl flex items-center"><UserCircle className="mr-2 h-5 w-5 md:h-6 md:w-6 text-primary" />User Profile</CardTitle>
        <CardDescription className="text-xs md:text-sm">Manage your profile information (Placeholder).</CardDescription>
      </CardHeader>
      <CardContent className="p-2 md:p-3">
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4 md:p-6 border rounded-md bg-card">
            <UserCircle className="w-12 h-12 md:w-20 md:h-20 mb-3 md:mb-4 opacity-50" />
            <p className="text-center text-sm md:text-base">User authentication and profile management features will be available here in a future update.</p>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar side="left" variant="sidebar" collapsible="icon" className="border-r shadow-md bg-sidebar text-sidebar-foreground">
        <SidebarHeader className="p-2 sm:p-3">
           <div className="flex items-center gap-2">
             <Landmark className={`h-6 w-6 sm:h-7 sm:w-7 text-sidebar-primary`} />
             <h1 className={`text-lg sm:text-xl font-bold tracking-tight text-sidebar-primary transition-opacity duration-300 ${sidebarOpen ? "opacity-100" : "sr-only"}`}>VeriCourt</h1>
           </div>
        </SidebarHeader>
        <SidebarContent className="p-1.5 sm:p-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => setActiveView('liveSession')} isActive={activeView === 'liveSession'} tooltip="Live Session" size="sm">
                <Mic /> <span className={sidebarOpen ? "" : "sr-only"}>Live Session</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => setActiveView('recordings')} isActive={activeView === 'recordings'} tooltip="Recordings" size="sm">
                <FolderOpen /> <span className={sidebarOpen ? "" : "sr-only"}>Recordings</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => setActiveView('transcriptions')} isActive={activeView === 'transcriptions'} tooltip="Transcriptions" size="sm">
                <ListOrdered /> <span className={sidebarOpen ? "" : "sr-only"}>Transcriptions</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => setActiveView('searchCases')} isActive={activeView === 'searchCases'} tooltip="Search Cases" size="sm">
                <Search /> <span className={sidebarOpen ? "" : "sr-only"}>Search Cases</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="p-1.5 sm:p-2 border-t border-sidebar-border mt-auto">
           <SidebarMenu>
             <SidebarMenuItem>
              <SidebarMenuButton onClick={() => setActiveView('settings')} isActive={activeView === 'settings'} tooltip="Settings" size="sm">
                <Settings /> <span className={sidebarOpen ? "" : "sr-only"}>Settings</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => setActiveView('userProfile')} isActive={activeView === 'userProfile'} tooltip="User Profile" size="sm">
                <UserCircle /> <span className={sidebarOpen ? "" : "sr-only"}>User Profile</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
                <SidebarMenuButton onClick={() => window.open('https://github.com/firebase/genkit/issues/new/choose', '_blank')} tooltip="Report Issue/Help" size="sm">
                    <CircleHelp /> <span className={sidebarOpen ? "" : "sr-only"}>Help / Report Issue</span>
                </SidebarMenuButton>
            </SidebarMenuItem>
           </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className={`flex flex-col transition-all duration-300 ease-in-out bg-background ${sidebarOpen && sidebarState === 'collapsed' ? "md:ml-[var(--sidebar-width-icon)]" : (sidebarOpen && sidebarState === 'expanded' ? "md:ml-[var(--sidebar-width)]" : "md:ml-0")}`}>
        <header className={`flex items-center justify-between p-2 sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b md:p-3 ${activeView === 'liveSession' ? 'hidden' : ''}`}>
            <div className="flex items-center gap-2 md:hidden">
              <SidebarTrigger />
              <span className="font-semibold text-base text-primary truncate">
                {activeView === 'recordings' && "Recordings"}
                {activeView === 'transcriptions' && "Transcript"}
                {activeView === 'searchCases' && "Search"}
                {activeView === 'settings' && "Settings"}
                {activeView === 'userProfile' && "Profile"}
              </span>
            </div>

            <div className="hidden md:flex items-center w-full">
                <h2 className="text-lg font-semibold text-primary">
                    {activeView === 'liveSession' && "Live Court Session"}
                    {activeView === 'recordings' && "Saved Sessions"}
                    {activeView === 'transcriptions' && "Manage Active Transcript"}
                    {activeView === 'searchCases' && "Smart Case Search"}
                    {activeView === 'settings' && "Application Settings"}
                    {activeView === 'userProfile' && "User Profile"}
                </h2>
            </div>
        </header>

        <main className={`flex-grow overflow-auto ${activeView === 'liveSession' ? 'p-0' : 'p-2 md:p-3'}`}>
          {activeView === 'liveSession' && renderLiveSessionView()}
          {activeView === 'recordings' && renderRecordingsView()}
          {activeView === 'transcriptions' && renderTranscriptionsView()}
          {activeView === 'searchCases' && renderSearchView()}
          {activeView === 'settings' && renderSettingsView()}
          {activeView === 'userProfile' && renderUserProfileView()}
        </main>

        <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
          <DialogContent className="max-w-xs sm:max-w-sm md:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-sm sm:text-base md:text-lg">Save Current Session</DialogTitle>
              <DialogDescription className="text-xs sm:text-sm">
                Confirm the details for this court proceeding session. Audio, transcript, case details, and annotations will be saved.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 md:gap-3 py-3 md:py-4 text-xs sm:text-sm">
                <div className="grid grid-cols-4 items-center gap-2 md:gap-3">
                    <Label htmlFor="dialog-session-title" className="text-right">Title</Label>
                    <Input id="dialog-session-title" value={currentSessionTitle} onChange={(e) => setCurrentSessionTitle(e.target.value)} className="col-span-3 h-8 md:h-9" />
                </div>
                 <div className="grid grid-cols-4 items-center gap-2 md:gap-3">
                    <Label htmlFor="dialog-session-judge" className="text-right">Judge</Label>
                    <Input id="dialog-session-judge" value={caseJudge} onChange={(e) => setCaseJudge(e.target.value)} className="col-span-3 h-8 md:h-9" />
                </div>
                 <div className="grid grid-cols-4 items-center gap-2 md:gap-3">
                    <Label htmlFor="dialog-session-hearing" className="text-right">Hearing Type</Label>
                    <Input id="dialog-session-hearing" value={caseHearingType} onChange={(e) => setCaseHearingType(e.target.value)} className="col-span-3 h-8 md:h-9" />
                </div>
                <div className="grid grid-cols-4 items-center gap-2 md:gap-3">
                    <Label htmlFor="dialog-session-courtroom" className="text-right">Courtroom</Label>
                    <Input id="dialog-session-courtroom" value={caseCourtroom} onChange={(e) => setCaseCourtroom(e.target.value)} className="col-span-3 h-8 md:h-9" />
                </div>
                <div className="grid grid-cols-4 items-center gap-2 md:gap-3">
                    <Label className="text-right col-span-1 pt-1 md:pt-2 self-start">Participants</Label>
                    <div className="col-span-3 space-y-1">
                        {caseParticipants.length > 0 ? caseParticipants.map((p, i) => <Badge key={i} variant="secondary" className="mr-1 mb-1 text-xs">{p}</Badge>) : <span className="text-xs text-muted-foreground">No participants added.</span>}
                    </div>
                </div>
                 <div className="grid grid-cols-4 items-center gap-2 md:gap-3">
                    <Label className="text-right col-span-1 pt-1 md:pt-2 self-start">Annotations</Label>
                    <div className="col-span-3 space-y-1">
                        {annotations.length > 0 ? <span className="text-xs text-muted-foreground">{annotations.length} note(s) will be saved.</span> : <span className="text-xs text-muted-foreground">No annotations.</span>}
                    </div>
                </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSaveDialog(false)} className="h-8 md:h-9 text-xs sm:text-sm">Cancel</Button>
              <Button onClick={handleConfirmSave} disabled={isSaving || !currentSessionTitle.trim()} className="h-8 md:h-9 text-xs sm:text-sm">
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showAllAnnotationsDialog} onOpenChange={setShowAllAnnotationsDialog}>
            <DialogContent className="max-w-xs sm:max-w-md md:max-w-xl lg:max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="text-sm sm:text-base md:text-lg">All Annotations for: <span className="font-normal break-all">{currentSessionTitle}</span></DialogTitle>
                    <DialogDescription className="text-xs sm:text-sm">
                        Review all notes and tags for this session. Sorted by most recent.
                    </DialogDescription>
                </DialogHeader>
                <ScrollArea className="max-h-[50vh] sm:max-h-[60vh] p-1 pr-2 sm:pr-3">
                    {annotations.length > 0 ? (
                        <div className="space-y-2">
                            {annotations.sort((a, b) => b.timestamp - a.timestamp).map(ann => (
                                <Card key={ann.id} className="shadow-sm">
                                    <CardContent className="p-2 text-xs sm:text-sm">
                                        <div className="flex justify-between items-start mb-1">
                                            {ann.tag && <Badge variant="outline" className="text-xs">{ann.tag}</Badge>}
                                            <span className="text-xs text-muted-foreground ml-auto">{formatTime(ann.timestamp)}</span>
                                        </div>
                                        <p className="whitespace-pre-wrap">{ann.text}</p>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    ) : (
                        <p className="text-xs sm:text-sm text-muted-foreground text-center py-4 md:py-6">No annotations for this session.</p>
                    )}
                </ScrollArea>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button type="button" variant="outline" className="h-8 md:h-9 text-xs sm:text-sm">Close</Button>
                    </DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>

         {activeView !== 'liveSession' && currentDateTime && (
            <footer className="w-full mt-auto p-2 md:p-2.5 text-center text-xs text-muted-foreground border-t bg-muted/30">
                <p>&copy; {currentDateTime.getFullYear()} VeriCourt. All rights reserved.</p>
                <p className="mt-0.5 text-[0.7rem] sm:text-xs">AI-Powered Legal Transcription for Nigerian Professionals.</p>
            </footer>
         )}
      </SidebarInset>
    </div>
  );
}

