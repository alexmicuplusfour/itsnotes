# Google Keep Import Utility

This utility allows you to import your Google Keep notes from a Google Takeout export into this Keep clone application.

## Prerequisites

1. Export your Google Keep notes using Google Takeout
2. Extract the downloaded Takeout archive
3. Place the `keep-takeout` directory containing your JSON note files at the root of this project (same level as `client` and `server` directories)

## Database Configuration

The import script is configured to connect to PostgreSQL using these credentials:
- Host: 192.168.100.128
- Port: 5435
- User: myuser
- Database: mydatabase
- Password: mypassword

Make sure the database is running and accessible with these credentials before running the import script.

## Running the Import

1. Make sure your database is running
2. Make sure the `keep-takeout` directory is in the right location
3. From the project root directory, run:

```bash
cd server
node src/import-notes.js
```

## Features

- Imports all notes from Google Keep Takeout JSON files
- Preserves note content, creation date, modification date, and status (pinned, archived, trashed)
- Maps Google Keep colors to the application's color scheme
- Imports labels/tags from Google Keep and associates them with notes
- Reports detailed progress and results

## Color Mapping

The script maps Google Keep colors to the application's color scheme:

| Google Keep | App Color |
|-------------|-----------|
| PINK        | blossom   |
| GRAY        | chalk     |
| BROWN       | clay      |
| RED         | coral     |
| DEFAULT     | default   |
| PURPLE      | dusk      |
| BLUE        | fog       |
| GREEN       | mint      |
| ORANGE      | peach     |
| TEAL        | sage      |
| YELLOW      | sand      |
| CERULEAN    | storm     |

## Troubleshooting

- If the import fails with database connection errors, verify that your PostgreSQL server is running and accessible with the provided credentials.
- If notes fail to import, check the error message for details. Common issues include JSON parsing errors or missing required fields in the note data.
- If the script reports "Directory not found", make sure the `keep-takeout` directory is in the right location.