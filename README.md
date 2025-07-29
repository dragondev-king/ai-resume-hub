# AI Resume Generator

A modern React application that generates professional resumes using AI, tailored to specific job descriptions. The app creates beautiful, formatted .docx files that can be downloaded and used for job applications.

## Features

- 🔐 **User Authentication**: Secure login/signup with Supabase Auth
- 📝 **Profile Management**: Create and manage multiple professional profiles
- 🤖 **AI-Powered Resume Enhancement**: Uses OpenAI to tailor your resume to specific job descriptions
- 👀 **Live Preview**: See your resume before generating the final document
- 📄 **DOCX Export**: Download professional Word documents
- 🎨 **Modern UI**: Beautiful, responsive design with TailwindCSS
- 📱 **Mobile Friendly**: Works seamlessly on all devices

## Tech Stack

- **Frontend**: React 19 + TypeScript
- **Styling**: TailwindCSS
- **Form Handling**: React Hook Form
- **Authentication & Database**: Supabase
- **AI Integration**: OpenAI API
- **Document Generation**: docx.js
- **Icons**: Lucide React
- **Notifications**: React Hot Toast

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Supabase account
- OpenAI API key

## Setup Instructions

### 1. Supabase Setup

1. **Create a Supabase project**
   - Go to [supabase.com](https://supabase.com)
   - Create a new project
   - Note down your project URL and anon key

2. **Set up the database schema**
   - Go to your Supabase project dashboard
   - Navigate to SQL Editor
   - Run the SQL commands from `supabase-schema.sql`

3. **Configure authentication**
   - In your Supabase dashboard, go to Authentication > Settings
   - Enable email authentication
   - Configure any additional auth providers if needed

### 2. Environment Variables

Create a `.env` file in the root directory:

```env
REACT_APP_SUPABASE_URL=your_supabase_project_url
REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key
REACT_APP_OPENAI_API_KEY=your_openai_api_key
```

### 3. Installation

```bash
# Install dependencies
npm install

# Start development server
npm start
```

The app will open at [http://localhost:3000](http://localhost:3000)

## Usage

### 1. Authentication
- Sign up with your email and password
- Sign in to access your dashboard

### 2. Profile Management
- **Create Profiles**: Add your professional information, experience, education, and skills
- **Edit Profiles**: Update your information anytime
- **Multiple Profiles**: Create different profiles for different career paths

### 3. Resume Generation
- **Select Profile**: Choose which profile to use for resume generation
- **Add Job Description**: Paste the job description you're applying for
- **Generate Resume**: The AI will analyze the job description and enhance your resume
- **Download**: Get your professional .docx resume

## Project Structure

```
src/
├── components/
│   ├── Auth.tsx              # Authentication component
│   ├── ProfileForm.tsx       # Profile management form
│   ├── ResumeGenerator.tsx   # Resume generation component
│   └── ResumePreview.tsx     # Resume preview component
├── contexts/
│   └── AuthContext.tsx       # Authentication context
├── lib/
│   └── supabase.ts          # Supabase client and types
├── types/
│   └── resume.ts            # Resume data types
├── utils/
│   ├── resumeGenerator.ts   # AI integration
│   └── docxGenerator.ts     # Document generation
└── App.tsx                  # Main app component
```

## Database Schema

The app uses a single `profiles` table with the following structure:

```sql
profiles (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  location TEXT,
  linkedin TEXT,
  portfolio TEXT,
  summary TEXT,
  experience JSONB,
  education JSONB,
  skills TEXT[],
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
```

## Configuration

### Supabase Configuration

1. **Authentication**: Configure email/password auth in Supabase dashboard
2. **Row Level Security**: Already configured in the schema
3. **Policies**: Users can only access their own profiles

### OpenAI API Setup

1. Visit [OpenAI Platform](https://platform.openai.com/api-keys)
2. Create an account or sign in
3. Generate a new API key
4. Add the key to your `.env` file

### Customization

You can customize the app by modifying:

- **Styling**: Edit `tailwind.config.js` for theme changes
- **AI Prompts**: Modify the prompt in `src/utils/resumeGenerator.ts`
- **Document Format**: Adjust the DOCX generation in `src/utils/docxGenerator.ts`
- **Database Schema**: Modify `supabase-schema.sql` for additional fields

## API Usage

The app uses two APIs:

- **Supabase**: Authentication and data storage
- **OpenAI**: Resume enhancement (GPT-3.5-turbo)
  - Cost: ~$0.002 per 1K tokens
  - Typical cost: ~$0.01-0.05 per resume

## Development

### Available Scripts

- `npm start` - Start development server
- `npm build` - Build for production
- `npm test` - Run tests
- `npm eject` - Eject from Create React App

### Adding New Features

1. **New Profile Fields**: Add to `ProfileForm.tsx` and update database schema
2. **AI Enhancements**: Modify prompts in `resumeGenerator.ts`
3. **Document Format**: Update `docxGenerator.ts` for new sections

## Security Notes

✅ **Secure Implementation**:
- Row Level Security enabled
- User authentication required
- API keys stored in environment variables
- Users can only access their own data

⚠️ **Production Considerations**:
- Consider moving OpenAI API calls to a backend server
- Implement rate limiting
- Add additional security measures as needed

## Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

### Other Platforms

The app can be deployed to any platform that supports React apps:
- Netlify
- AWS Amplify
- Firebase Hosting
- Heroku

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

If you encounter any issues:

1. Check the browser console for errors
2. Verify your environment variables are correct
3. Ensure Supabase is properly configured
4. Check your OpenAI API key and usage
5. Verify your internet connection

## Roadmap

- [ ] PDF export option
- [ ] Multiple resume templates
- [ ] Cover letter generation
- [ ] Resume scoring and feedback
- [ ] Template customization
- [ ] Bulk resume generation
- [ ] Integration with job boards
- [ ] Resume history and versioning
- [ ] Team collaboration features
