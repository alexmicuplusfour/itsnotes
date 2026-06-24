import React from 'react';
import {
  SectionContainer,
  SectionTitle,
  OperatorsList,
  OperatorItem,
  OperatorSymbol,
  OperatorDescription,
} from './styles';

const HelpTab = () => (
  <>
    <SectionContainer>
      <SectionTitle>Reminders</SectionTitle>
      <p style={{ marginBottom: '16px', fontSize: '14px', color: 'var(--text-secondary-color)' }}>
        Reminders are scheduled prompts attached to a note. When one fires, the note is pinned to the top of your list and a notification is sent.
      </p>

      <p style={{ marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary-color)', fontWeight: 500 }}>
        Creating a reminder
      </p>
      <p style={{ marginBottom: '16px', fontSize: '14px', color: 'var(--text-secondary-color)' }}>
        In a note, type a phrase that includes "remind me", "set a reminder", or "set reminder". Once detected, the <strong>Generate Reminder</strong> option in the Add Content (+) menu becomes enabled — click it to have AI parse the phrase into a one-time or recurring schedule.
      </p>
      <OperatorsList>
        <OperatorItem>
          <OperatorSymbol>Remind me to call mom tomorrow at 5pm</OperatorSymbol>
          <OperatorDescription>
            One-time reminder for tomorrow 5pm in your timezone.
          </OperatorDescription>
        </OperatorItem>
        <OperatorItem>
          <OperatorSymbol>Remind me to pay rent on the 1st of every month</OperatorSymbol>
          <OperatorDescription>
            Recurring monthly reminder.
          </OperatorDescription>
        </OperatorItem>
        <OperatorItem>
          <OperatorSymbol>Set a reminder for standup every weekday at 9am</OperatorSymbol>
          <OperatorDescription>
            Recurring Mon–Fri reminder.
          </OperatorDescription>
        </OperatorItem>
        <OperatorItem>
          <OperatorSymbol>Remind me about the anniversary on July 18 every year</OperatorSymbol>
          <OperatorDescription>
            Recurring yearly reminder.
          </OperatorDescription>
        </OperatorItem>
      </OperatorsList>

      <p style={{ marginTop: '20px', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary-color)', fontWeight: 500 }}>
        When a reminder fires
      </p>
      <ul style={{ marginTop: 0, paddingLeft: '20px', fontSize: '14px', color: 'var(--text-secondary-color)', lineHeight: 1.6 }}>
        <li>The note is pinned to the top of your list.</li>
        <li>A browser notification appears (if you've granted permission).</li>
        <li>An optional push notification is sent if you've configured a provider in the Notifications tab.</li>
        <li>One-time reminders are removed after firing; recurring reminders advance to the next occurrence.</li>
      </ul>
    </SectionContainer>

    <SectionContainer>
      <SectionTitle>Books, Movies & TV Shows</SectionTitle>
      <p style={{ marginBottom: '16px', fontSize: '14px', color: 'var(--text-secondary-color)' }}>
        Paste a link from Goodreads (books) or IMDb / TMDB (movies & TV shows) and itsnotes turns it into a rich card — cover or poster, author or director, rating, year, and more — instead of a plain link.
      </p>

      <p style={{ marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary-color)', fontWeight: 500 }}>
        How to add one
      </p>
      <ol style={{ marginTop: 0, marginBottom: '16px', paddingLeft: '20px', fontSize: '14px', color: 'var(--text-secondary-color)', lineHeight: 1.6 }}>
        <li>Copy the page link from Goodreads, IMDb, or TMDB.</li>
        <li>Open a note and click the Add Content <strong>(+)</strong> menu.</li>
        <li>The menu detects the link on your clipboard and offers <strong>Add Goodreads / IMDb / TMDB Title</strong> — click it.</li>
        <li>The details are fetched automatically and a card is inserted into the note.</li>
      </ol>

      <p style={{ marginTop: '20px', marginBottom: 0, fontSize: '14px', color: 'var(--text-secondary-color)' }}>
        Adding the same title again reuses the existing card rather than creating a duplicate.
      </p>
    </SectionContainer>

    <SectionContainer>
      <SectionTitle>Advanced Search Guide</SectionTitle>
      <p style={{ marginBottom: '16px', fontSize: '14px', color: 'var(--text-secondary-color)' }}>
        This search supports advanced operators to help you find your notes more efficiently.
      </p>
      <OperatorsList>
        <OperatorItem>
          <OperatorSymbol>"phrase"</OperatorSymbol>
          <OperatorDescription>
            Search for an exact phrase with words in that exact order.
          </OperatorDescription>
        </OperatorItem>

        <OperatorItem>
          <OperatorSymbol>term1 OR term2</OperatorSymbol>
          <OperatorDescription>
            Find notes containing either term1 or term2 (or both).
          </OperatorDescription>
        </OperatorItem>

        <OperatorItem>
          <OperatorSymbol>-word</OperatorSymbol>
          <OperatorDescription>
            Exclude notes containing this word.
          </OperatorDescription>
        </OperatorItem>

        <OperatorItem>
          <OperatorSymbol>word1 * word2</OperatorSymbol>
          <OperatorDescription>
            Find notes with word1 followed by any word, then word2.
          </OperatorDescription>
        </OperatorItem>

        <OperatorItem>
          <OperatorSymbol>#tag</OperatorSymbol>
          <OperatorDescription>
            Find notes with a specific tag.
          </OperatorDescription>
        </OperatorItem>

        <OperatorItem>
          <OperatorSymbol>$color</OperatorSymbol>
          <OperatorDescription>
            Find notes with a specific color (default, red, blue, etc.).
          </OperatorDescription>
        </OperatorItem>

        <OperatorItem>
          <OperatorSymbol>yr:YYYY[:MMM]</OperatorSymbol>
          <OperatorDescription>
            Find notes created in a specific year, or year and month (e.g., `yr:2024`, `yr:2024:mar`, `yr:2024:September`).
          </OperatorDescription>
        </OperatorItem>
      </OperatorsList>
    </SectionContainer>

    <SectionContainer>
      <SectionTitle>Keyboard Shortcuts</SectionTitle>
      <p style={{ marginBottom: '16px', fontSize: '14px', color: 'var(--text-secondary-color)' }}>
        Shortcuts available while editing or selecting notes.
      </p>
      <OperatorsList>
        <OperatorItem>
          <OperatorSymbol>Ctrl / Cmd + A</OperatorSymbol>
          <OperatorDescription>
            Select all visible notes (bulk selection mode only).
          </OperatorDescription>
        </OperatorItem>
        <OperatorItem>
          <OperatorSymbol>Delete</OperatorSymbol>
          <OperatorDescription>
            Move selected notes to trash (bulk selection mode only).
          </OperatorDescription>
        </OperatorItem>
        <OperatorItem>
          <OperatorSymbol>Escape</OperatorSymbol>
          <OperatorDescription>
            Clear selection and exit bulk selection mode. Also closes the open note form.
          </OperatorDescription>
        </OperatorItem>
      </OperatorsList>
    </SectionContainer>
  </>
);

export default HelpTab;
