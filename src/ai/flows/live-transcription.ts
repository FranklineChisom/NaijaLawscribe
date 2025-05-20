// The live transcription flow handles real-time audio transcription.
// It defines the input and output schemas for the transcription process.
// It also exports an async function `liveTranscription` to initiate the flow.

'use server';

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const LiveTranscriptionInputSchema = z.object({
  audioDataUri: z
    .string()
    .describe(
      "Audio data as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});

export type LiveTranscriptionInput = z.infer<typeof LiveTranscriptionInputSchema>;

const LiveTranscriptionOutputSchema = z.object({
  transcription: z.string().describe('The real-time transcription of the audio.'),
});

export type LiveTranscriptionOutput = z.infer<typeof LiveTranscriptionOutputSchema>;

export async function liveTranscription(input: LiveTranscriptionInput): Promise<LiveTranscriptionOutput> {
  return liveTranscriptionFlow(input);
}

const liveTranscriptionPrompt = ai.definePrompt({
  name: 'liveTranscriptionPrompt',
  input: {schema: LiveTranscriptionInputSchema},
  output: {schema: LiveTranscriptionOutputSchema},
  prompt: `Transcribe the following audio in real-time:\n\n{{media url=audioDataUri}}`,
});

const liveTranscriptionFlow = ai.defineFlow(
  {
    name: 'liveTranscriptionFlow',
    inputSchema: LiveTranscriptionInputSchema,
    outputSchema: LiveTranscriptionOutputSchema,
  },
  async input => {
    const {output} = await liveTranscriptionPrompt(input);
    return output!;
  }
);
