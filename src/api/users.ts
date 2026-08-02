import { apiClient, uploadFile } from "@/api/client";
import type { User, UserProfile } from "@/types/api";

export function fetchMe(): Promise<User> {
  return apiClient.get<User>("/api/me");
}

export function completeUserOnboarding(): Promise<{ onboardedAt: string | null }> {
  return apiClient.post<{ onboardedAt: string | null }>("/api/me/onboarding/complete", {});
}

export function setEmailNotifications(enabled: boolean): Promise<{ emailNotifications: boolean }> {
  return apiClient.post<{ emailNotifications: boolean }>("/api/me/email-notifications", {
    enabled,
  });
}

export function fetchUser(id: number): Promise<User> {
  return apiClient.get<User>(`/api/users/${id}`);
}

export function registerUser(data: {
  email: string;
  password: string;
  challenge: string;
  displayName: string;
  acceptedTerms?: boolean;
  dateOfBirth?: string;
}): Promise<User> {
  return apiClient.post<User>("/api/users", data);
}

export function updateProfile(
  profileIri: string,
  data: {
    name?: string;
    avatar?: null;
    bio?: string | null;
    location?: string | null;
    website?: string | null;
    birthdayMonth?: number | null;
    birthdayDay?: number | null;
  },
): Promise<UserProfile> {
  return apiClient.patch<UserProfile>(profileIri, data);
}

export function uploadAvatar(file: File): Promise<UserProfile> {
  return uploadFile<UserProfile>("/api/me/avatar", file);
}

export function changePassword(data: {
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  return apiClient.post("/api/users/me/change-password", data);
}

export function requestPasswordReset(email: string): Promise<void> {
  return apiClient.post("/api/reset_password", { email });
}

export function confirmPasswordReset(
  email: string,
  token: string,
  password: string,
): Promise<void> {
  return apiClient.post("/api/password", { email, token, password });
}
