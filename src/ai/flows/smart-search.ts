// Use server directive.
'use server';

/**
 * @fileOverview Implements a smart search flow to find specific keywords, phrases,
 * or legal references within a transcription.
 *
 * - smartSearch - A function that searches the transcription for specific terms.
 * - SmartSearchInput - The input type for the smartSearch function.
 * - SmartSearchOutput - The return type for the smartSearch function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SmartSearchInputSchema = z.object({
  transcription: z
    .string()
    .describe('The full text of the court proceeding transcription.'),
  searchTerm: z
    .string()
    .describe(
      'The keyword, phrase, or legal reference to search for in the transcription.'
    ),
});
export type SmartSearchInput = z.infer<typeof SmartSearchInputSchema>;

const SmartSearchOutputSchema = z.object({
  searchResults: z
    .array(z.string())
    .describe(
      'An array of relevant excerpts from the transcription containing the search term.'
    ),
  summary: z.string().describe('A summary of the search results.'),
});
export type SmartSearchOutput = z.infer<typeof SmartSearchOutputSchema>;

export async function smartSearch(input: SmartSearchInput): Promise<SmartSearchOutput> {
  return smartSearchFlow(input);
}

const smartSearchPrompt = ai.definePrompt({
  name: 'smartSearchPrompt',
  input: {schema: SmartSearchInputSchema},
  output: {schema: SmartSearchOutputSchema},
  prompt: `You are a legal assistant tasked with searching court transcriptions.

  A user will provide a transcription and a search term. You must identify all
  relevant excerpts from the transcription that contain the search term and provide a summary of the search results.

  Transcription: {{{transcription}}}
  Search Term: {{{searchTerm}}}

  Return the search results as an array of excerpts and a summary.
  `,
});

const smartSearchFlow = ai.defineFlow(
  {
    name: 'smartSearchFlow',
    inputSchema: SmartSearchInputSchema,
    outputSchema: SmartSearchOutputSchema,
  },
  async input => {
    const {output} = await smartSearchPrompt(input);
    return output!;
  }
);
