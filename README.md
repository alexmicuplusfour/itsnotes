# Google Keep Clone

A modern, full-stack clone of Google Keep built with Node.js, PostgreSQL, React, and Socket.io for real-time updates. Fully containerized with Docker for easy deployment and sharing.

## ✨ Features

- 📝 Create, edit, and delete notes with rich text support
- 🏷️ Tag management and organization
- 📌 Pin important notes (appear at the top)
- 🗃️ Archive and trash functionality
- 🎨 Color-coded notes with custom themes
- 🔄 Real-time syncing between clients via WebSockets
- 📱 Responsive design optimized for mobile and desktop
- 🔍 Advanced search functionality
- 📥 Import notes from Google Takeout
- 🌙 Dark/light theme support
- ♾️ Infinite scroll for performance
- 📷 Image attachment support

## 🚀 Quick Start (Docker - Recommended)

### Prerequisites
- Docker and Docker Compose
- At least 4GB of available RAM

### 1. Clone and Setup
```bash
git clone <repository-url>
cd keep
```

### 2. Configure Environment (Optional)
```bash
cp .env.example .env
# Edit .env to customize database credentials and ports if needed
```

### 3. Start with Docker
```bash
docker-compose up -d
```

The application will be available at **http://localhost:3000**

### 4. Stop the Application
```bash
docker-compose down
```

## 🛠️ Development Setup (Local)

## 🛠️ Development Setup (Local)

### Prerequisites
- Node.js 16+
- PostgreSQL 12+

### 1. Start Database with Docker
```bash
docker-compose up postgres -d
```

### 2. Configure Environment
Copy the server environment file:
```bash
cp server/.env.example server/.env
```

Edit `server/.env` with your database settings:
```bash
DB_HOST=localhost
DB_PORT=5432
DB_USER=keepuser
DB_PASSWORD=keeppassword
DB_NAME=keepnotes
PORT=5000
```

### 3. Install Dependencies
```bash
# Install root dependencies
npm install

# Install server dependencies
cd server && npm install && cd ..

# Install client dependencies  
cd client && npm install && cd ..
```

### 4. Start Development Servers
```bash
# Start both server and client in development mode
npm run dev
```

This will start:
- Client: http://localhost:3000
- Server: http://localhost:5000

## 🐳 Docker Configuration

### Services
- **postgres**: PostgreSQL database (internal port 5432)
- **server**: Node.js API server (internal port 5000) 
- **client**: React app served by Nginx (exposed port 3000)

### Environment Variables
Configure in `.env` file:
```bash
# Database Configuration
DB_USER=keepuser
DB_PASSWORD=keeppassword
DB_NAME=keepnotes

# Client Configuration  
CLIENT_PORT=3000
```

### Docker Commands
```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down

# Rebuild images
docker-compose build

# Reset everything (removes data!)
docker-compose down -v
```

## 📁 Project Structure

```
keep/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── contexts/       # React contexts
│   │   ├── services/       # API and socket services
│   │   └── utils/          # Utility functions
│   ├── Dockerfile
│   └── nginx.conf         # Nginx configuration
├── server/                # Node.js backend
│   ├── src/
│   │   ├── routes/        # API routes
│   │   ├── models/        # Database models
│   │   └── utils/         # Server utilities
│   ├── Dockerfile
│   └── .env.example
├── docker-compose.yml     # Docker orchestration
├── .env                   # Environment configuration
└── README.md
```

## 🔧 Configuration Details

### Client-Server Communication
The client automatically detects the environment:
- **Development**: Connects directly to server on port 5000
- **Docker/Production**: Uses nginx proxy to `/api` endpoints

### Database Connection
- Uses PostgreSQL with automatic table initialization
- Supports connection pooling and health checks
- Configurable via environment variables

### File Uploads
- Supports large file uploads (up to 10GB)
- Google Takeout import functionality
- Temporary files managed in Docker volumes

## 🚨 Troubleshooting

### Common Issues

**Port Conflicts**
```bash
# Change CLIENT_PORT in .env
CLIENT_PORT=3001
```

**Database Connection Issues**
```bash
# Check database is running
docker-compose ps postgres

# View database logs
docker-compose logs postgres
```

**Memory Issues**
```bash
# Ensure Docker has enough memory allocated (4GB minimum)
# Check Docker Desktop settings
```

### Reset Database
```bash
docker-compose down -v
docker-compose up postgres -d
```

### View Application Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f server
docker-compose logs -f client
```

## 🔒 Security

- Server runs as non-root user in Docker
- Database not exposed externally
- Nginx handles static file serving securely
- Environment variables for sensitive configuration
- HTTPS ready (add certificates to nginx config)

## 📊 Monitoring

### Health Checks
All services include health checks:
- **Server**: GET /api/notes endpoint
- **Client**: Nginx status check
- **Database**: PostgreSQL ready check

### Performance
- Infinite scroll for large note collections
- Optimized bundle sizes with code splitting
- Efficient database queries with connection pooling
- Real-time updates without polling

## 🔄 Updates

To update the application:
```bash
git pull
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

## 📞 Support

If you encounter issues:
1. Check service status: `docker-compose ps`
2. View logs: `docker-compose logs -f`
3. Verify environment configuration in `.env`
4. Try rebuilding: `docker-compose build --no-cache`
   
   # Or start separately
   npm run server
   npm run client
   ```

5. Open your browser and navigate to:
   - Client: http://localhost:3000
   - Server API: http://localhost:5000/api/notes

### Docker Setup

To run the application using Docker:

1. Make sure Docker and Docker Compose are installed on your system.

2. Build and start the containers:
   ```bash
   docker-compose up -d
   ```

3. Access the application:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:5000

#### Docker Container Details

- **postgres**: PostgreSQL database
- **server**: Node.js backend API
- **client**: React frontend served via Nginx

#### Environment Variables

You can customize the Docker setup by modifying the environment variables in the `docker-compose.yml` file:
- Database credentials
- API port settings
- Frontend configuration

#### Data Persistence

The PostgreSQL data is stored in a Docker volume named `postgres_data`. This ensures your data persists even when containers are removed.

## Project Structure

```
keep-clone/
├── client/               # React frontend
│   ├── src/
│   │   ├── components/   # UI components
│   │   ├── contexts/     # React contexts for state management
│   │   ├── services/     # API services
│   │   ├── App.jsx       # Main app component
│   │   └── index.jsx     # Entry point
├── server/               # Node.js backend
│   ├── src/
│   │   ├── models/       # Data models
│   │   ├── routes/       # API routes
│   │   ├── db.js         # Database connection
│   │   └── index.js      # Server entry point
```

## API Endpoints

- `GET /api/notes` - Get all notes (with pagination)
- `GET /api/notes/search` - Search notes
- `GET /api/notes/:id` - Get a single note
- `POST /api/notes` - Create a new note
- `PUT /api/notes/:id` - Update a note
- `DELETE /api/notes/:id` - Delete a note permanently
- `PATCH /api/notes/:id/archive` - Archive a note
- `PATCH /api/notes/:id/unarchive` - Unarchive a note
- `PATCH /api/notes/:id/trash` - Move a note to trash
- `PATCH /api/notes/:id/restore` - Restore a note from trash
- `PATCH /api/notes/:id/pin` - Toggle pin status

## Real-time Features

The application uses Socket.io to provide real-time synchronization:

- Changes to notes are broadcast to all connected clients
- Notes are automatically updated in the UI when changed by other users
- No page refresh required to see the latest changes