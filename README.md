# AI Resume Hub

A comprehensive React-based web application for professional resume management with AI-powered generation, team collaboration, and role-based access control. Built with modern technologies and designed for seamless team workflows.

## ✨ Features

### 🤖 AI-Powered Resume Generation
- **GPT-4 Enhanced Content**: Generate tailored resumes using OpenAI's GPT-4 model
- **Smart Content Optimization**: AI-enhanced summaries, experience descriptions, and skills
- **Job Description Matching**: Customize resumes based on specific job requirements
- **Real-time Preview**: See generated content before downloading
- **Editable Content**: Modify AI-generated content before finalizing
- **Professional Formatting**: Download as properly formatted `.docx` files

### 👥 Team Collaboration & Role-Based Access Control
- **Three-Tier Role System**:
  - **Bidders**: Generate resumes using assigned profiles
  - **Managers**: Create/manage profiles and assign them to bidders
  - **Admins**: Full system access with user management capabilities
- **Profile Assignment System**: Managers can assign profiles to specific bidders
- **User Management**: Admins can create, edit, and delete users with role assignment

### 📊 Advanced Job Application Tracking
- **Comprehensive History**: Track all resume generations with job details
- **Detailed Metadata**: Store job descriptions, company names, and application links
- **Advanced Filtering**: Filter by profile, bidder, date range, and custom criteria
- **Pagination Support**: Handle large datasets with efficient pagination
- **Application Details Modal**: View complete application information
- **Export Capabilities**: Download application data for analysis

### 🔐 Security & User Management
- **Supabase Authentication**: Secure user authentication and session management
- **Admin-Controlled Access**: Only administrators can create new users
- **Role-Based Route Protection**: Automatic access control based on user roles
- **User Profile Management**: Complete user lifecycle management
- **Audit Trail**: Track all user activities and system changes

### 🎨 Modern User Interface
- **Responsive Design**: Works seamlessly on desktop and mobile devices
- **TailwindCSS Styling**: Modern, clean, and professional appearance
- **Interactive Components**: Modal dialogs, forms, and data tables
- **Real-time Notifications**: Toast notifications for user feedback
- **Loading States**: Smooth user experience with loading indicators

## 🛠 Tech Stack

### Frontend
- **React 18** with TypeScript for type safety
- **React Router DOM** for client-side routing
- **TailwindCSS** for modern styling
- **React Hook Form** for form management
- **Lucide React** for beautiful icons
- **React Hot Toast** for notifications

### Backend & Database
- **Supabase** (PostgreSQL) for database and authentication
- **OpenAI API** (GPT-4) for AI-powered content generation
- **Row Level Security** (RLS) for data protection

### Document Generation
- **docx** library for professional Word document creation
- **File Saver** for client-side file downloads

## 🚀 Quick Start

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- Supabase account
- OpenAI API key

### 1. Clone and Install

```bash
git clone <repository-url>
cd ai-resume-generator
npm install
```

### 2. Database Setup

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Go to Settings > API to get your project URL and anon key
3. Run the database setup scripts in the SQL editor:

```sql
-- Copy and paste the contents of sql/simple-setup.sql
-- Copy and paste and run the 09-comprehensive-rpc-functions.sql
-- This creates all necessary tables, functions, and triggers
```

### 3. Environment Configuration

Create a `.env` file in the root directory:

```env
REACT_APP_SUPABASE_URL=your_supabase_project_url
REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 4. Start Development Server

```bash
npm start
```

The application will be available at `http://localhost:3000`

## 📋 Usage Guide

### Initial Setup (Admin Only)

1. **Create First Admin User**:
   ```sql
   -- In Supabase SQL Editor, run:
   UPDATE users SET role = 'admin' WHERE email = 'your-email@example.com';
   ```

2. **Login and Create Users**: Use the admin interface to create additional users

### For Bidders
1. **Login**: Sign in with credentials provided by your administrator
2. **Select Profile**: Choose from assigned professional profiles
3. **Enter Job Details**: Provide job description, company, and title
4. **Generate Resume**: Let AI create a tailored resume
5. **Edit & Download**: Modify content and download as Word document
6. **Track Applications**: View your application history

### For Managers
1. **Create Profiles**: Add professional profiles with experience, education, and skills
2. **Assign Profiles**: Assign profiles to specific bidders
3. **Monitor Applications**: View job applications from assigned profiles
4. **Filter & Analyze**: Use advanced filters to analyze application patterns

### For Admins
1. **User Management**: Create, edit, and delete users with appropriate roles
2. **System Overview**: View all profiles, assignments, and applications
3. **Role Assignment**: Assign and manage user roles (bidder, manager, admin)
4. **System Analytics**: Access comprehensive system data

## 🏗 Project Structure

```
src/
├── components/              # React components
│   ├── Auth.tsx            # Authentication UI
│   ├── Layout.tsx          # Main layout with navigation
│   ├── ProtectedRoute.tsx  # Route protection
│   ├── ProfileForm.tsx     # Profile creation/editing
│   ├── ResumeGenerator.tsx # AI resume generation
│   ├── JobApplications.tsx # Application history & tracking
│   ├── ProfileAssignments.tsx # Profile assignment management
│   ├── UserManagement.tsx  # User management (admin)
│   ├── ResumePreview.tsx   # Resume preview
│   └── AssignBiddersModal.tsx # Bidder assignment modal
├── pages/                  # Page components
│   ├── ProfilesPage.tsx    # Profiles management
│   ├── GeneratorPage.tsx   # Resume generation
│   ├── ApplicationsPage.tsx # Applications history
│   ├── AssignmentsPage.tsx # Profile assignments
│   └── UsersPage.tsx       # User management
├── contexts/               # React contexts
│   ├── AuthContext.tsx     # Authentication state
│   ├── UserContext.tsx     # User data and role management
│   └── ProfilesContext.tsx # Profile data management
├── lib/                    # Library configurations
│   └── supabase.ts         # Supabase client and types
├── types/                  # TypeScript definitions
│   ├── resume.ts           # Resume-related types
│   └── user.ts             # User-related types
├── utils/                  # Utility functions
│   ├── resumeGenerator.ts  # AI integration with OpenAI
│   └── docxGenerator.ts    # Word document generation
└── App.tsx                 # Main application component
```

## 🗄 Database Schema

### Core Tables
- **`users`**: User accounts with roles (bidder/manager/admin)
- **`profiles`**: Professional resume profiles
- **`profile_assignments`**: Profile-to-bidder assignments
- **`job_applications`**: Job application history and metadata

### Key Features
- **Automatic User Sync**: New auth users are synced to public.users
- **Role-Based Access**: Simple role management without complex RLS
- **Comprehensive Tracking**: Full audit trail of all activities

## 🔧 Configuration

### OpenAI API
- **Model**: `gpt-4.1-mini` (latest model)
- **Temperature**: 0.7 (balanced creativity and consistency)
- **Max Tokens**: 2000 (increased for comprehensive content)

### Supabase
- **PostgreSQL Database**: Robust data storage
- **Real-time Capabilities**: Live data synchronization
- **Authentication**: Secure user management

### TailwindCSS
- **Custom Configuration**: Optimized for the application
- **Responsive Design**: Mobile-first approach
- **Professional Styling**: Clean and modern UI

## 🚀 Deployment

### Vercel (Recommended)
1. Connect your GitHub repository
2. Set environment variables
3. Deploy automatically on push

### Netlify
1. Build command: `npm run build`
2. Publish directory: `build`
3. Set environment variables

### Other Platforms
The app can be deployed to any static hosting service that supports React applications.

## 🔍 Troubleshooting

### Common Issues

**"Database error creating new user"**
- Run the cleanup script first: `sql/01-cleanup-simple.sql`
- Then run the complete setup: `sql/simple-setup.sql`

**"User not allowed"**
- Admin API may not be available in free tier
- Use the app's user management interface instead

**"Role not found"**
- Run user sync script: `sql/06-sync-existing-users.sql`
- Ensure user exists in public.users table

### Development Tips
- Check browser console for detailed error messages
- Verify environment variables are set correctly
- Ensure Supabase project is properly configured

## 📈 Roadmap

### 🚀 High Priority Features
- [ ] **Resume Templates & Customization**
  - Custom color schemes and fonts
  - Template preview before generation
  - Save favorite templates per user
- [ ] **Enhanced Job Application Tracking**
  - Application status tracking (Applied, Interview, Offer, Rejected)
  - Interview scheduling and reminders
- [ ] **Advanced Resume Analytics**
  - ATS (Applicant Tracking System) compatibility checker
  - Keyword optimization suggestions
  - Resume scoring and improvement recommendations

### 📊 Medium Priority Features
- [ ] **Improved AI Capabilities**
  - Cover letter generation
  - Interview question preparation
  - Salary negotiation tips
  - Industry-specific resume optimization
- [ ] **Better User Experience**
  - Drag-and-drop resume builder interface
  - Export to multiple formats (PDF, DOCX, HTML)
  - Dark/light theme toggle
- [ ] **Collaboration Features**
  - Comments and feedback system

### 🛠 Technical Improvements
- [ ] **Performance & Reliability**
  - Offline mode for basic editing
  - Faster loading times
  - Better error handling and recovery
- [ ] **Data Management**
  - Advanced search and filtering
  - Data migration tools

### 🎯 User-Centric Features
- [ ] **Personalization**
  - Custom resume sections
  - Social media links
- [ ] **Workflow Improvements**
  - Quick resume updates

### 🔧 Specific Technical Enhancements
- [ ] **Current System Improvements**
  - Progress indicators for long generations
  - Email alerts for application deadlines
  - Bulk actions for job applications
- [ ] **Integration Opportunities**
  - Email integration for follow-ups

### 💡 Innovative Features
- [ ] **AI-Powered Insights**
  - Job market analysis for your skills
  - Salary range recommendations
  - Skill gap analysis
- [ ] **Community Features**
  - Resume sharing (anonymous)
  - Industry-specific resume examples
  - Peer review system
  - Expert consultation booking

### 🎨 UI/UX Enhancements
- [ ] **Visual Improvements**
  - Interactive resume builder
  - Progress tracking dashboard
  - Achievement badges/milestones

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Check the documentation
- Review the code comments

---

**Built with ❤️ using React, TypeScript, and Supabase**
