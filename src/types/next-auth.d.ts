import "next-auth";
import { JWT } from "next-auth/jwt";

declare module "next-auth" {
  interface User {
    id: string;
    shopId: number;
    name: string;
    email: string;
    role: string;
  }

  interface Session {
    user: {
      id: string;
      shopId: number;
      name: string;
      email: string;
      role: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    shopId: number;
    role: string;
  }
}
