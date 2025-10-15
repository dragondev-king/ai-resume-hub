# Vercel Serverless Functions Setup Guide

This guide will help you set up and deploy the AI Resume Generator with Vercel serverless functions to resolve CORS issues.

## What Changed?

The app previously called OpenAI's API directly from the browser, which caused CORS errors. We've now moved all OpenAI API calls to secure serverless functions that run on Vercel's backend.

## Architecture

```
Frontend (React) → Vercel Serverless Functions → OpenAI API
```

- **Frontend**: Makes requests to `/api/*` endpoints
- **Serverless Functions**: Handle OpenAI API calls securely
- **OpenAI API**: Generates resume content

## Setup Instructions

### 1. Install Dependencies

```bash
npm install --save-dev @vercel/node
```

### 2. Environment Variables

#### Local Development (`.env.local`)
Create a `.env.local` file in the root directory:

```env
# OpenAI API Key (for Vercel serverless functions)
OPENAI_API_KEY=your_openai_api_key_here

# Supabase Configuration (for frontend)
REACT_APP_SUPABASE_URL=your_supabase_url_here
REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

#### Vercel Production
In your Vercel dashboard:

1. Go to **Settings** → **Environment Variables**
2. Add the following variables:
   - `OPENAI_API_KEY` - Your OpenAI API key
   - `REACT_APP_SUPABASE_URL` - Your Supabase project URL
   - `REACT_APP_SUPABASE_ANON_KEY` - Your Supabase anonymous key

### 3. API Endpoints

Three serverless functions have been created:

1. **`/api/generate-resume`** - Generates tailored resume content
2. **`/api/generate-cover-letter`** - Generates personalized cover letters
3. **`/api/generate-answer`** - Generates answers to application questions

### 4. Deploy to Vercel

#### Option A: Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy
vercel
```

#### Option B: GitHub Integration

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Click **"Import Project"**
4. Select your GitHub repository
5. Configure environment variables
6. Deploy!

### 5. Local Development

To test serverless functions locally:

```bash
# Install Vercel CLI
npm i -g vercel

# Run dev server with serverless functions
vercel dev
```

This starts a local server that simulates Vercel's environment, allowing you to test the API endpoints.

## How It Works

### Before (CORS Error)
```javascript
// ❌ Direct OpenAI call from browser
const openai = new OpenAI({
  apiKey: process.env.REACT_APP_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true, // Security risk!
});
```

### After (Secure)
```javascript
// ✅ Call Vercel serverless function
const response = await fetch('/api/generate-resume', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ profile, jobDescription }),
});
```

## Benefits

✅ **No CORS errors** - API calls happen server-side  
✅ **API key security** - Key never exposed to the browser  
✅ **Better performance** - Optimized serverless execution  
✅ **Cost control** - Rate limiting can be implemented  
✅ **Monitoring** - Vercel provides function logs and analytics  

## Troubleshooting

### Issue: "Module not found: @vercel/node"
**Solution**: Run `npm install --save-dev @vercel/node`

### Issue: "OPENAI_API_KEY is not defined"
**Solution**: 
- Check your `.env.local` file locally
- Verify environment variables in Vercel dashboard for production

### Issue: "404 Not Found" when calling API
**Solution**: 
- Ensure you're using `vercel dev` for local testing
- Make sure the `api/` folder exists in your project root
- Check that the API functions are deployed in Vercel

### Issue: API calls timeout
**Solution**:
- Vercel free tier has 10s timeout for serverless functions
- Consider upgrading if you need longer execution times
- Optimize OpenAI prompts to reduce token usage

## File Structure

```
ai-resume-generator/
├── api/                              # Vercel serverless functions
│   ├── generate-resume.ts           # Resume generation endpoint
│   ├── generate-cover-letter.ts     # Cover letter generation endpoint
│   └── generate-answer.ts           # Answer generation endpoint
├── src/
│   └── utils/
│       ├── resumeGenerator.ts       # Updated to call API
│       └── coverLetterGenerator.ts  # Updated to call API
└── .env.local                       # Local environment variables (create this)
```

## Security Notes

- **Never commit** `.env.local` or `.env` files to version control
- **Never expose** your OpenAI API key in the frontend code
- **Use environment variables** for all sensitive data
- **Implement rate limiting** in production to prevent abuse

## Additional Resources

- [Vercel Serverless Functions Docs](https://vercel.com/docs/functions)
- [OpenAI API Documentation](https://platform.openai.com/docs)
- [Environment Variables in Vercel](https://vercel.com/docs/environment-variables)

## Support

If you encounter any issues, check:
1. Vercel function logs in the dashboard
2. Browser console for frontend errors
3. Network tab to see API request/response

