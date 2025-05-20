'use server';

import { liveTranscription as aiLiveTranscription, LiveTranscriptionInput, LiveTranscriptionOutput } from '@/ai/flows/live-transcription';
import { smartSearch as aiSmartSearch, SmartSearchInput, SmartSearchOutput } from '@/ai/flows/smart-search';

export async function transcribeAudioAction(
  audioDataUri: string
): Promise<{ transcription?: string; error?: string }> {
  try {
    const input: LiveTranscriptionInput = { audioDataUri };
    // console.log('Calling AI live transcription with input:', input.audioDataUri.substring(0,100));
    const result: LiveTranscriptionOutput = await aiLiveTranscription(input);
    // console.log('AI live transcription result:', result);
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
    // console.log('Calling AI smart search with input:', input);
    const results: SmartSearchOutput = await aiSmartSearch(input);
    // console.log('AI smart search result:', results);
    return { results };
  } catch (error) {
    console.error('Error in searchTranscriptAction:', error);
    return { error: error instanceof Error ? error.message : 'An unknown error occurred during search.' };
  }
}
