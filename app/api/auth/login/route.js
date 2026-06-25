/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextResponse } from "next/server";

const SESSION_TOKEN = "session-auth-token-web-consolidator-123";

export async function POST(req) {
  try {
    const { username, password } = await req.json();

    const expectedUsername = process.env.ADMIN_USERNAME || "admin";
    const expectedPassword = process.env.ADMIN_PASSWORD || "password123";

    if (username === expectedUsername && password === expectedPassword) {
      // In a full production app, use jwt.sign(). Here we issue a secure signed stateless token
      // and can set it as an HttpOnly secure cookie or return it in JSON
      const response = NextResponse.json({
        success: true,
        token: SESSION_TOKEN,
        username: expectedUsername,
      });

      // Issue HttpOnly Cookie for security
      response.cookies.set("admin_session", SESSION_TOKEN, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 60 * 60 * 24, // 1 day
        path: "/",
      });

      return response;
    }

    return NextResponse.json(
      { error: "Invalid username or password credentials." },
      { status: 401 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: "Internal server error occurred: " + err.message },
      { status: 500 }
    );
  }
}
