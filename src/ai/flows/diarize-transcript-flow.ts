
'use server';
/**
 * @fileOverview Implements a speaker diarization flow.
 * This flow takes a full audio recording and its raw transcript,
 * then attempts to identify different speakers and segment the transcript accordingly.
 *
 * - diarizeTranscript - A function that handles the speaker diarization process.
 * - DiarizeTranscriptInput - The input type for the diarizeTranscript function.
 * - DiarizeTranscriptOutput - The return type for the diarizeTranscript function.
 * - DiarizedSegment - Represents a segment of speech attributed to a speaker.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const DiarizeTranscriptInputSchema = z.object({
  audioDataUri: z
    .string()
    .describe(
      "The full audio recording as a data URI, including MIME type and Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
  rawTranscript: z
    .string()
    .describe('The complete raw, unformatted text of the transcription.'),
});
export type DiarizeTranscriptInput = z.infer<typeof DiarizeTranscriptInputSchema>;

const DiarizedSegmentSchema = z.object({
  speaker: z
    .string()
    .describe(
      "An identifier for the speaker (e.g., 'Speaker 1', 'Judge', 'Counsel A')."
    ),
  text: z.string().describe('The segment of speech attributed to this speaker.'),
});
export type DiarizedSegment = z.infer<typeof DiarizedSegmentSchema>;

const DiarizeTranscriptOutputSchema = z.object({
  diarizedSegments: z
    .array(DiarizedSegmentSchema)
    .describe(
      'An array of speech segments, each containing the speaker and their text.'
    ),
});
export type DiarizeTranscriptOutput = z.infer<
  typeof DiarizeTranscriptOutputSchema
>;

export async function diarizeTranscript(
  input: DiarizeTranscriptInput
): Promise<DiarizeTranscriptOutput> {
  return diarizeTranscriptFlow(input);
}

const diarizationPrompt = ai.definePrompt({
  name: 'diarizationPrompt',
  input: {schema: DiarizeTranscriptInputSchema},
  output: {schema: DiarizeTranscriptOutputSchema},
  prompt: `You are an expert AI assistant specializing in analyzing audio recordings and transcribing conversations with speaker labels, particularly for legal or formal proceedings.
Given the full audio of a conversation and its raw, unformatted transcription, your task is to:
1. Identify distinct speakers in the audio. Assign generic labels like "Speaker 1", "Speaker 2", etc. If context from the transcript suggests roles (e.g., "Judge", "Plaintiff's Counsel", "Witness"), use those more descriptive labels where appropriate and consistent.
2. Segment the provided raw transcript according to these identified speakers. Ensure each part of the raw transcript is attributed to a speaker.
3. Format the output as an array of objects, where each object represents a continuous segment of speech from a single speaker. Each object must include:
    - "speaker": A string identifying the speaker.
    - "text": A string containing the transcribed text spoken by that speaker during that segment.

Here is the audio and the raw transcript:
Audio: {{media url=audioDataUri}}

Raw Transcript:
{{{rawTranscript}}}

Return an object with a single key "diarizedSegments" containing an array of these speaker segments.
Ensure the entire raw transcript is covered and attributed to speakers in the output array. Maintain the original wording from the raw transcript for each speaker's segment.
If the audio quality is too poor to reliably distinguish speakers or if the transcript is very short and appears to be from a single speaker, you may attribute it all to "Speaker 1" or a general "Narrator" if applicable.
`,
});

const diarizeTranscriptFlow = ai.defineFlow(
  {
    name: 'diarizeTranscriptFlow',
    inputSchema: DiarizeTranscriptInputSchema,
    outputSchema: DiarizeTranscriptOutputSchema,
  },
  async (input: DiarizeTranscriptInput) => {
    const {output} = await diarizationPrompt(input);
    if (!output) {
        throw new Error('Diarization failed to produce an output.');
    }
    return output;
  }
);

    
