
'use server';

import { liveTranscription as aiLiveTranscription, LiveTranscriptionInput, LiveTranscriptionOutput } from '@/ai/flows/live-transcription';
import { smartSearch as aiSmartSearch, SmartSearchInput, SmartSearchOutput } from '@/ai/flows/smart-search';
import { diarizeTranscript as aiDiarizeTranscript, DiarizeTranscriptInput, DiarizeTranscriptOutput, DiarizedSegment } from '@/ai/flows/diarize-transcript-flow';

export async function transcribeAudioAction(
  input: LiveTranscriptionInput
): Promise<{ transcription?: string; error?: string }> {
  try {
    const result: LiveTranscriptionOutput = await aiLiveTranscription(input);
    return { transcription: result.transcription };
  } catch (error) {
    console.error('Error in transcribeAudioAction:', error);
    return { error: error instanceof Error ? error.message : 'An unknown error occurred during transcription.' };
  }
}

export async function searchTranscriptAction(
  input: SmartSearchInput
): Promise<{ results?: SmartSearchOutput; error?: string }> {
  try {
    const results: SmartSearchOutput = await aiSmartSearch(input);
    return { results };
  } catch (error) {
    console.error('Error in searchTranscriptAction:', error);
    return { error: error instanceof Error ? error.message : 'An unknown error occurred during search.' };
  }
}

export async function diarizeTranscriptAction(
  input: DiarizeTranscriptInput
): Promise<{ segments?: DiarizedSegment[]; error?: string }> {
  try {
    const result: DiarizeTranscriptOutput = await aiDiarizeTranscript(input);
    return { segments: result.diarizedSegments };
  } catch (error) {
    console.error('Error in diarizeTranscriptAction:', error);
    return { error: error instanceof Error ? error.message : 'An unknown error occurred during diarization.' };
  }
}
    
