
'use server';
/**
 * @fileOverview Implements a speaker diarization flow.
 * This flow takes a full audio recording and its raw transcript,
 * then attempts to identify different speakers and segment the transcript accordingly.
 * It tries to extract actual speaker names or roles if mentioned, otherwise uses generic labels.
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
      "An identifier for the speaker (e.g., 'Speaker 1', 'Judge John Doe', 'Counsel Adaobi Okafor', 'Witness Chinedu')."
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
  prompt: `You are an expert AI assistant specializing in analyzing audio recordings and transcribing conversations with speaker labels, particularly for legal or formal proceedings in a Nigerian context.
Given the full audio of a conversation and its raw, unformatted transcription, your task is to:
1. Identify distinct speakers in the audio.
   - Attempt to identify specific speaker names if they are explicitly mentioned (e.g., "Mr. John Doe speaking", "My name is Jane Smith", or if a speaker refers to another by name like "Thank you, Counsel Davis", or "Witness Adebayo, please proceed").
   - If names are not explicitly stated but roles are clear from the context of the transcript or common legal parlance (e.g., "The Judge", "Plaintiff's Counsel", "Defense Counsel", "Registrar", "Witness"), use these roles as speaker labels. You may append a generic number if multiple people share the same role (e.g. "Witness 1", "Witness 2").
   - If neither specific names nor distinct roles can be confidently identified for a speaker, fall back to generic labels such as "Speaker 1", "Speaker 2".
2. Segment the provided raw transcript according to these identified speakers. Ensure each part of the raw transcript is attributed to a speaker.
3. Format the output as an array of objects, where each object represents a continuous segment of speech from a single speaker. Each object must include:
    - "speaker": A string identifying the speaker (e.g., "Judge Coker", "Counsel Adaobi Okafor", "Witness Chinedu", "Speaker 1").
    - "text": A string containing the transcribed text spoken by that speaker during that segment.

Here is the audio and the raw transcript:
Audio: {{media url=audioDataUri}}

Raw Transcript:
{{{rawTranscript}}}

Return an object with a single key "diarizedSegments" containing an array of these speaker segments.
Ensure the entire raw transcript is covered and attributed to speakers in the output array. Maintain the original wording from the raw transcript for each speaker's segment.
If the audio quality is too poor to reliably distinguish speakers or if the transcript is very short and appears to be from a single speaker, you may attribute it all to "Unknown Speaker" or a general "Narrator" if applicable, or "Speaker 1".
Strive for accuracy in matching spoken words to the correct identified speaker.
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

    