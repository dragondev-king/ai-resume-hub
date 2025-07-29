# AI Resume Generator

A React-based web application that generates professional resumes using AI, with role-based access control and comprehensive job application tracking.

## Features

### 🤖 AI-Powered Resume Generation
- Generate tailored resumes based on job descriptions
- AI-enhanced content optimization for summaries, experience descriptions, and skills
- Download resumes as `.docx` files
- Real-time preview of generated content

### 👥 Role-Based Access Control
- **Bidders**: Can only generate resumes using assigned profiles
- **Managers**: Can create/manage profiles and assign them to bidders
- **Admins**: Full system access, can manage all users and data

### 📊 Job Application History
- Track all resume generations with job details
- Store job description links for future reference
- Filter applications by profile, date range, and other criteria
- View generated content and application metadata

### 🔐 User Management
- Secure authentication with Supabase (admin-controlled user creation)
- Profile assignment system for managers
- Admin user management (create, edit, delete users with roles)
- Comprehensive audit trail of all activities

### 🌐 URL Routing
- Each page has its own URL for easy navigation
- Role-based route protection
- Deep linking support

## Tech Stack

- **Frontend**: React 18 + TypeScript
- **Styling**: TailwindCSS
- **Routing**: React Router DOM
- **Authentication & Database**: Supabase (PostgreSQL)
- **Form Management**: React Hook Form
- **AI Integration**: OpenAI API (GPT-3.5-turbo)
- **Document Generation**: `docx` library
- **Icons**: Lucide React
- **Notifications**: React Hot Toast

## Prerequisites

- Node.js (v16 or higher)
- npm or pnpm
- Supabase account
- OpenAI API key

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd ai-resume-generator
npm install --legacy-peer-deps
```

### 2. Supabase Setup

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Go to Settings > API to get your project URL and anon key
3. Run the database schema in the SQL editor:

```sql
-- Copy and paste the contents of supabase-schema.sql
```

### 3. Environment Variables

Create a `.env` file in the root directory:

```env
REACT_APP_SUPABASE_URL=your_supabase_project_url
REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key
REACT_APP_OPENAI_API_KEY=your_openai_api_key
```

### 4. Start Development Server

```bash
npm start
```

The application will be available at `http://localhost:3000`

## Usage

### Initial Setup (Admin Only)
1. **Create First Admin User**: Use Supabase Auth Admin API or dashboard to create the first admin user
2. **Set Admin Role**: Update the user's role to 'admin' in the `user_roles` table
3. **Create Additional Users**: Use the admin interface to create and manage other users

### For Bidders
1. **Login**: Sign in with credentials provided by your administrator
2. **Generate Resumes**: Select from assigned profiles and input job details
3. **View History**: Check your application history and generated resumes

### For Managers
1. **Create Profiles**: Add professional profiles with experience, education, and skills
2. **Assign Profiles**: Assign profiles to specific bidders
3. **Monitor Applications**: View job applications from assigned profiles
4. **Filter & Analyze**: Use filters to analyze application patterns

### For Admins
1. **User Management**: Create, edit, and delete users with appropriate roles
2. **System Overview**: View all profiles, assignments, and applications
3. **Analytics**: Access comprehensive system analytics and reports
4. **Role Assignment**: Assign and manage user roles (bidder, manager, admin)

## Project Structure

```
src/
├── components/          # React components
│   ├── Auth.tsx        # Authentication UI (sign-in only)
│   ├── Layout.tsx      # Main layout with navigation
│   ├── ProtectedRoute.tsx # Route protection
│   ├── ProfileForm.tsx # Profile creation/editing
│   ├── ResumeGenerator.tsx # Resume generation
│   ├── JobApplications.tsx # Application history
│   ├── ProfileAssignments.tsx # Profile assignment management
│   ├── UserManagement.tsx # User management (admin)
│   └── ResumePreview.tsx # Resume preview
├── pages/              # Page components
│   ├── ProfilesPage.tsx # Profiles management page
│   ├── GeneratorPage.tsx # Resume generation page
│   ├── ApplicationsPage.tsx # Applications history page
│   ├── AssignmentsPage.tsx # Profile assignments page
│   └── UsersPage.tsx   # User management page
├── contexts/           # React contexts
│   └── AuthContext.tsx # Authentication state management
├── lib/               # Library configurations
│   └── supabase.ts    # Supabase client and types
├── types/             # TypeScript type definitions
│   └── resume.ts      # Resume-related types
├── utils/             # Utility functions
│   ├── resumeGenerator.ts # AI integration
│   └── docxGenerator.ts   # Document generation
└── App.tsx            # Main application component
```

## Database Schema

### Core Tables
- **profiles**: User professional profiles
- **user_roles**: User role assignments (bidder/manager/admin)
- **profile_assignments**: Profile-to-bidder assignments
- **job_applications**: Job application history and metadata

### Security Features
- Row Level Security (RLS) policies
- Role-based access control
- Secure API endpoints
- Data isolation between users

## Authentication Flow

### User Creation (Admin Only)
- Only administrators can create new users through the admin interface
- Users are created with email confirmation disabled for immediate access
- Roles are automatically assigned during user creation

### User Login
- Users sign in with credentials provided by administrators
- No self-registration available
- Automatic role-based access control after authentication

## Troubleshooting

### User Roles Infinite Recursion Error

If you encounter a "infinite recursion detected in policy for relation 'user_roles'" error, follow these steps:

1. **Run the Fix Script**: Execute the `fix-user-roles-policies.sql` script in your Supabase SQL editor
2. **Alternative Manual Fix**:
   - Go to your Supabase dashboard → SQL Editor
   - Drop the problematic policies:
     ```sql
     DROP POLICY IF EXISTS "Users can view their own role" ON user_roles;
     DROP POLICY IF EXISTS "Admins can view all roles" ON user_roles;
     ```
   - Create the new policies from the updated `supabase-schema.sql`
3. **Ensure All Users Have Roles**:
   ```sql
   INSERT INTO user_roles (user_id, role)
   SELECT id, 'bidder'
   FROM auth.users
   WHERE id NOT IN (SELECT user_id FROM user_roles)
   ON CONFLICT (user_id) DO NOTHING;
   ```

### Admin API Access

If the admin API is not available (common in free tier), the application will fall back to using role data only. User management features may be limited but will still work.

### Creating the First Admin User

If you need to create the first admin user manually:

1. **Create User in Supabase Auth**:
   - Go to Supabase Dashboard → Authentication → Users
   - Click "Add User" and create a user with email and password

2. **Assign Admin Role**:
   ```sql
   INSERT INTO user_roles (user_id, role) 
   VALUES ('user-uuid-here', 'admin');
   ```

3. **Login and Create Other Users**: Use the admin interface to create additional users

## Configuration

### TailwindCSS
The project uses TailwindCSS for styling. Configuration is in `tailwind.config.js`.

### OpenAI API
- Model: `gpt-3.5-turbo`
- Temperature: 0.7 (balanced creativity and consistency)
- Max tokens: 2000

### Supabase
- PostgreSQL database
- Real-time subscriptions (if needed)
- Storage for file uploads (future feature)

## API Usage

### OpenAI API
The application uses OpenAI's GPT-3.5-turbo model to:
- Generate professional summaries
- Optimize experience descriptions
- Suggest relevant skills
- Tailor content to job requirements

### Supabase API
- Authentication and user management
- Real-time data synchronization
- File storage and retrieval
- Database operations with RLS

## Development

### Code Style
- TypeScript for type safety
- ESLint for code quality
- Prettier for formatting
- Component-based architecture

### Testing
```bash
npm test
```

### Building for Production
```bash
npm run build
```

## Security Notes

- All database operations use Row Level Security
- API keys are stored in environment variables
- User authentication is handled by Supabase
- No sensitive data is stored in client-side code

## Deployment

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

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For support and questions:
- Create an issue in the repository
- Check the documentation
- Review the code comments

## Roadmap

### Planned Features
- [ ] Resume template customization
- [ ] Bulk profile import/export
- [ ] Advanced analytics dashboard
- [ ] Email notifications
- [ ] Resume version control
- [ ] Integration with job boards
- [ ] Mobile application
- [ ] Multi-language support

### Technical Improvements
- [ ] Unit and integration tests
- [ ] Performance optimization
- [ ] Accessibility improvements
- [ ] PWA capabilities
- [ ] Offline support
