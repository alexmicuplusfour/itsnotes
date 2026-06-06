# Google Keep Clone Advanced Search Operators

This document describes the advanced search operators implemented in the Google Keep Clone application.

## Basic Search
By default, searching for multiple words will find notes that contain ALL the words anywhere in the note (title or content). The words don't need to be adjacent or in the same order.

Example: `project meeting notes` will find notes containing all three words anywhere in the note.

## Advanced Search Operators

### Quoted Phrases
Use quotes to search for exact phrases.

Example: `"project meeting"` will find notes containing the exact phrase "project meeting".

### OR Operator
Use the OR operator to find notes containing either term.

Example: `meeting OR call` will find notes containing either "meeting" or "call".

### Exclusion Operator
Use the minus (-) sign to exclude notes containing specific terms.

Example: `meeting -zoom` will find notes containing "meeting" but not "zoom".

### Wildcard Operator
Use the asterisk (*) as a wildcard to match any single word between terms.

Example: `project * meeting` will find notes containing "project" followed by any single word, followed by "meeting".

Multiple wildcards work too: `project * * meeting` will find notes with "project" followed by any two words, followed by "meeting".

### Grouping with Parentheses
Use parentheses to group terms together with OR operators.

Example: `(zoom OR teams) meeting` will find notes containing either "zoom meeting" or "teams meeting".

### Special Search Operators

#### Tag Search
Search for notes with specific tags using the # symbol.

Example: `#important` will find notes tagged with "important".

#### Color Search
Search for notes with specific colors using the $ symbol.

Example: `$red` will find notes with the red color.

#### Year and Month Search
Search for notes created in a specific year, or a specific year and month, using the `yr:` prefix. You can specify the month using its full name or the three-letter shorthand (case-insensitive).

Examples:
- `yr:2023` will find notes created in 2023.
- `yr:2024:mar` will find notes created in March 2024.
- `yr:2024:September` will find notes created in September 2024.

## Combining Operators

All of these operators can be combined for powerful searches:

Example: `project (meeting OR planning) -cancelled #important $yellow` 
Finds notes:
- Containing "project" AND either "meeting" or "planning"
- NOT containing "cancelled"
- Tagged with "important"
- With yellow color

## Regex Support

For wildcard searches, the application uses PostgreSQL's regex support (via the ~* operator) with word boundary markers to ensure proper phrase matching.

## Implementation Details

The search functionality is implemented in the `Note.js` model file and uses PostgreSQL's ILIKE and regex (~*) operators for different search patterns. The search query is parsed into a criteria object with the following components:

- text: Regular search terms
- tags: Tag searches (#tag)
- color: Color search ($color)
- year: Year search (yr:YYYY or yr:YYYY:month)
- month: Month search (parsed from yr:YYYY:month)
- orGroups: OR groups (term1 OR term2) or grouped with parentheses
- excludedWords: Excluded terms (-term)
- wildcards: Terms containing wildcards (term1 * term2)

Each type of search criterion generates appropriate SQL conditions that are combined using AND or OR operators as needed.
