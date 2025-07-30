# Database Setup Scripts

This folder contains all the SQL scripts needed to set up the AI Resume Generator database.

## 🎯 **Simple Setup (Recommended)**

The simple setup creates a database without Row Level Security (RLS) policies, making it easier to develop and debug. Security is handled at the frontend level with route protection.

## 📁 **Simple Setup Scripts**

### **01-cleanup-simple.sql** - Cleanup Script
- **Purpose**: Removes all existing database objects
- **Usage**: Run when you need to start fresh
- **What it does**: Drops tables, functions, triggers, and enums

### **02-create-enums-simple.sql** - Enum Definitions
- **Purpose**: Creates the `user_role` enum
- **Usage**: Part of the setup process
- **What it does**: Defines bidder, manager, admin roles

### **03-create-tables-simple.sql** - Table Creation
- **Purpose**: Creates all necessary tables
- **Usage**: Part of the setup process
- **What it does**: Creates profiles, profile_assignments, job_applications, users tables

### **04-create-indexes-simple.sql** - Performance Indexes
- **Purpose**: Creates database indexes for performance
- **Usage**: Part of the setup process
- **What it does**: Optimizes query performance

### **05-create-trigger-simple.sql** - User Sync Trigger
- **Purpose**: Creates trigger to sync auth.users with public.users
- **Usage**: Part of the setup process
- **What it does**: Automatically syncs new users to public.users table

### **06-sync-existing-users.sql** - Sync Existing Users
- **Purpose**: Syncs existing users from auth.users to public.users
- **Usage**: Part of the setup process
- **What it does**: Copies existing users with default 'bidder' role

### **07-setup-admin-user.sql** - Admin Setup
- **Purpose**: Sets up initial admin user
- **Usage**: Run after setup, modify with your user ID
- **What it does**: Provides template to set admin role for your user

### **08-verify-simple-setup.sql** - Verification
- **Purpose**: Verifies everything is set up correctly
- **Usage**: Run after setup to confirm everything works
- **What it does**: Checks tables, triggers, functions, and indexes

## 🚀 **Quick Start - Simple Setup**

1. **Run the master script**:
   ```sql
   -- Copy and paste simple-setup.sql into Supabase SQL Editor
   ```

2. **Set up your admin user**:
   ```sql
   -- In 07-setup-admin-user.sql, uncomment and modify this line:
   INSERT INTO users (id, email, first_name, last_name, role, is_active) 
   VALUES ('YOUR_USER_ID_HERE', 'your-email@example.com', '', '', 'admin', true)
   ON CONFLICT (id) DO UPDATE SET role = 'admin';
   ```

3. **Verify the setup**:
   ```sql
   -- Run 08-verify-simple-setup.sql to confirm everything is working
   ```

## 📊 **Database Schema - Simple Setup**

### **Tables**:
- `users` - User information with role field (id, email, first_name, last_name, phone, role, is_active, created_at, updated_at)
- `profiles` - User resume profiles
- `profile_assignments` - Profile assignments to bidders
- `job_applications` - Job application history

### **Roles**:
- `bidder` - Can generate resumes using assigned profiles
- `manager` - Can create profiles and assign them to bidders
- `admin` - Full system access and user management

### **Key Features**:
- **No RLS policies** - Tables are completely open for development
- **Role field in users table** - Simple role management
- **Automatic user sync** - New auth users are synced to public.users
- **Frontend security** - Route protection based on user role

## 🔧 **Troubleshooting**

### **"Database error creating new user"**
- **Cause**: Trigger or table issues
- **Solution**: Run the cleanup script (01-cleanup-simple.sql) first, then the complete setup

### **"User not allowed"**
- **Cause**: Admin API not available in free tier
- **Solution**: Use the app's user management interface instead

### **"Table doesn't exist"**
- **Cause**: Setup script didn't run completely
- **Solution**: Run the complete setup script again

### **"Role not found"**
- **Cause**: User doesn't exist in public.users table
- **Solution**: Run 06-sync-existing-users.sql to sync existing users

## 🔒 **Security Approach**

### **Simple Setup (Current)**:
- **No database-level security** - Tables are completely open
- **Frontend route protection** - React Router guards based on user role
- **Simple role management** - Just update the `role` field in users table
- **Easy development** - No permission issues to debug

### **Future RLS Setup** (When ready):
- **Row Level Security** enabled on all tables
- **Role-based access control** for all operations
- **User-specific data isolation**
- **Admin-only user management**

## 📝 **Notes**

- All scripts use `IF EXISTS` and `IF NOT EXISTS` for safe execution
- Scripts can be run multiple times safely
- The setup is designed to work with Supabase's free tier
- User sync trigger has error handling to prevent user creation failures
- No complex RLS policies - perfect for development and testing

## 🎯 **Migration Path**

When you're ready to add security:

1. **Enable RLS** on all tables
2. **Create RLS policies** for each table
3. **Test thoroughly** to ensure policies work correctly
4. **Update frontend** to handle permission errors gracefully

The simple setup provides a solid foundation that can be easily enhanced with RLS when needed! 