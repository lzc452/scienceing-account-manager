export interface CreateUserDto {
  username: string;
  displayName: string;
  password: string;
  department?: string;
  role?: 'USER' | 'ADMIN';
}
