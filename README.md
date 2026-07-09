# Introduction

KB is a custom Knowledge Base platform being built to replace HelpJuice for internal company documentation.

The goal of the project is to provide a modern, structured, and production-ready knowledge base with support for article creation, rich editing, review workflows, role-based access control, publishing, version history, audit logs, media handling, and search.

The current repository contains the frontend implementation under `frontend/kb-frontend`. The backend folder is currently reserved for the future ASP.NET Core Web API implementation.

# Getting Started

## 1. Installation Process

Clone the repository:

```bash
git clone <repository-url>
cd knowledge-nase-platform
```

Navigate to the frontend project:

```bash
cd frontend/kb-frontend
```

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

The frontend should then be available at the local development URL shown in the terminal.

## 2. Software Dependencies

Main frontend dependencies:

* Next.js
* React
* TypeScript
* Material UI
* Tiptap editor
* Lucide React icons

Planned backend stack:

* ASP.NET Core Web API
* SQL Server
* Entity Framework Core
* Typesense for search indexing
* File/object storage for article content and media files

## 3. Latest Releases

No production release has been published yet.

Current status:

* Frontend structure is under development.
* Knowledge Base views and editor UI are being built.
* Backend implementation has not started yet.
* The `backend` folder is reserved for future backend work.

## 4. API References

Backend APIs are not available yet.

Planned API areas include:

* Articles
* Drafts
* Published versions
* Categories
* Users and roles
* Review workflow
* Comments and suggestions
* Media upload and references
* Search indexing
* Export jobs
* Audit logs

# Build and Test

Navigate to the frontend project:

```bash
cd frontend/kb-frontend
```

Run the development server:

```bash
npm run dev
```

Build the frontend:

```bash
npm run build
```

Run lint checks:

```bash
npm run lint
```

Run tests if configured:

```bash
npm test
```

If a command is not available, check `frontend/kb-frontend/package.json` for the currently supported scripts.

# Contribute

When contributing to the project:

1. Create a new branch for your work.

```bash
git checkout -b feature/your-feature-name
```

2. Make focused changes related to one feature or fix.

3. Run the available checks before committing.

```bash
npm run lint
npm run build
```

4. Commit your changes with a clear message.

```bash
git add .
git commit -m "Describe your change"
```

5. Push your branch.

```bash
git push origin feature/your-feature-name
```

6. Open a pull request for review.

##