# AI Resume Generator

A modern React application that generates professional resumes using AI, tailored to specific job descriptions. The app creates beautiful, formatted .docx files that can be downloaded and used for job applications.

## Features

- 🤖 **AI-Powered Resume Enhancement**: Uses OpenAI to tailor your resume to specific job descriptions
- 📝 **Comprehensive Form**: Collect personal information, experience, education, and skills
- 👀 **Live Preview**: See your resume before generating the final document
- 📄 **DOCX Export**: Download professional Word documents
- 🎨 **Modern UI**: Beautiful, responsive design with TailwindCSS
- 📱 **Mobile Friendly**: Works seamlessly on all devices

## Tech Stack

- **Frontend**: React 19 + TypeScript
- **Styling**: TailwindCSS
- **Form Handling**: React Hook Form
- **AI Integration**: OpenAI API
- **Document Generation**: docx.js
- **Icons**: Lucide React
- **Notifications**: React Hot Toast

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- OpenAI API key

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ai-resume-generator
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file in the root directory:
   ```env
   REACT_APP_OPENAI_API_KEY=your_openai_api_key_here
   ```

   **Important**: Get your OpenAI API key from [OpenAI Platform](https://platform.openai.com/api-keys)

4. **Start the development server**
   ```bash
   npm start
   ```

   The app will open at [http://localhost:3000](http://localhost:3000)

## Usage

### 1. Fill in Personal Information
- Enter your basic contact details
- Add optional LinkedIn and portfolio links

### 2. Add Job Description
- Paste the job description you're applying for
- The AI will use this to tailor your resume

### 3. Complete Your Profile
- **Professional Summary**: Add your current summary (optional - AI will enhance it)
- **Work Experience**: Add your job history with descriptions
- **Education**: Include your academic background
- **Skills**: List your technical and soft skills

### 4. Generate AI-Enhanced Resume
- Click "Generate AI Resume"
- The AI will analyze the job description and enhance your resume
- Review the generated content in the preview

### 5. Download Your Resume
- Click "Download .docx" to get your professional resume
- The file will be named: `FirstName_LastName_Resume.docx`

## Project Structure

```
src/
├── components/
│   ├── ResumeForm.tsx      # Main form component
│   └── ResumePreview.tsx   # Resume preview component
├── types/
│   └── resume.ts          # TypeScript interfaces
├── utils/
│   ├── resumeGenerator.ts # AI integration
│   └── docxGenerator.ts   # Document generation
├── App.tsx                # Main app component
└── index.tsx             # App entry point
```

## Configuration

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

## API Usage

The app uses the OpenAI API for resume enhancement. Each generation typically costs:
- **GPT-3.5-turbo**: ~$0.002 per 1K tokens
- **Typical resume generation**: ~$0.01-0.05 per resume

## Development

### Available Scripts

- `npm start` - Start development server
- `npm build` - Build for production
- `npm test` - Run tests
- `npm eject` - Eject from Create React App

### Adding New Features

1. **New Form Fields**: Add to `ResumeForm.tsx` and update types in `resume.ts`
2. **AI Enhancements**: Modify prompts in `resumeGenerator.ts`
3. **Document Format**: Update `docxGenerator.ts` for new sections

## Security Notes

⚠️ **Important**: This app currently uses the OpenAI API directly from the browser. For production use, consider:

- Moving API calls to a backend server
- Implementing rate limiting
- Adding user authentication
- Using environment variables properly

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
2. Verify your OpenAI API key is correct
3. Ensure all required fields are filled
4. Check your internet connection

## Roadmap

- [ ] PDF export option
- [ ] Multiple resume templates
- [ ] Cover letter generation
- [ ] Resume scoring and feedback
- [ ] Template customization
- [ ] Bulk resume generation
- [ ] Integration with job boards
