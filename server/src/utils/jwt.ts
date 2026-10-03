import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env";

export type AuthTokenPayload = {
  sub: string;
  email: string;
  role: "CUSTOMER" | "ADMIN";
  ver: number;
  sid?: string;
};

export function signAuthToken(payload: AuthTokenPayload): string {
  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  };
  return jwt.sign(payload, env.JWT_SECRET, options);
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload;
}
