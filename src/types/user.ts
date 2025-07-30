import { UserRole } from "../lib/supabase";

export default interface IUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
}