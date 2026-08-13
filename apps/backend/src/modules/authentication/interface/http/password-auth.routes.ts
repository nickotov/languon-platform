import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import {
  AuthCapabilitiesResponseSchema,
  AuthErrorResponseSchema,
  AuthenticationSuccessResponseSchema,
  ChangePasswordRequestSchema,
  CurrentUserResponseSchema,
  EmailVerificationResendRequestSchema,
  EmailVerificationResendResponseSchema,
  EmailVerificationVerifyRequestSchema,
  ForgotPasswordRequestSchema,
  ForgotPasswordResponseSchema,
  LogoutAllRequestSchema,
  LogoutAllResponseSchema,
  LogoutRequestSchema,
  LogoutResponseSchema,
  PasswordLoginRequestSchema,
  PasswordLoginResponseSchema,
  RefreshRequestSchema,
  ResetPasswordRequestSchema,
  ResetPasswordResponseSchema,
  SignUpRequestSchema,
  SignUpResponseSchema,
} from "@languon/contracts";
import type { z } from "zod";
import { authHttpBodyLimit, safeCorrelationId } from "./auth-http-body-limit";
import { AuthHttpError } from "./auth-http-error";
import { mapAuthenticationHttpError } from "./auth-http-error-mapping";
import {
  InvalidRequestOriginError,
  type AuthHttpPolicy,
} from "./auth-http-policy";
import { authenticationRequestMetadata } from "./auth-http-request";
import type { AuthenticationHttpOperations } from "./authentication-http-operations";

const errorResponse = {
  content: { "application/json": { schema: AuthErrorResponseSchema } },
  description: "Authentication request failed.",
} as const;
const errors = {
  400: errorResponse,
  401: errorResponse,
  403: errorResponse,
  409: errorResponse,
  413: errorResponse,
  429: errorResponse,
  500: errorResponse,
  503: errorResponse,
} as const;
const bearerSecurity = [{ bearerAuth: [] as string[] }];

function requestBody(schema: z.ZodType) {
  return {
    content: { "application/json": { schema } },
    required: true,
  };
}

function jsonResponse(schema: z.ZodType, description: string) {
  return { content: { "application/json": { schema } }, description };
}

function getCookie(header: string | undefined, name: string): string | null {
  for (const pair of header?.split(";") ?? []) {
    const separator = pair.indexOf("=");
    if (separator > 0 && pair.slice(0, separator).trim() === name) {
      return pair.slice(separator + 1).trim();
    }
  }
  return null;
}

export function createPasswordAuthRoutes(input: {
  operations: AuthenticationHttpOperations;
  policy: AuthHttpPolicy;
}): OpenAPIHono {
  const app = new OpenAPIHono({
    defaultHook: (result, context) => {
      if (!result.success) {
        return context.json(
          new AuthHttpError(
            "invalid_request",
            "The request is invalid.",
            400,
          ).response(safeCorrelationId(context.req.header("X-Correlation-ID"))),
          400,
        );
      }
    },
  });
  const { operations, policy } = input;

  app.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
    bearerFormat: "JWT",
    scheme: "bearer",
    type: "http",
  });

  app.use("*", async (context, next) => {
    for (const [name, value] of Object.entries(policy.securityHeaders())) {
      context.header(name, value);
    }
    const origin = context.req.header("Origin");
    if (origin) {
      try {
        policy.assertCookieRequestOrigin(origin);
        context.header("Access-Control-Allow-Origin", origin);
        context.header("Access-Control-Allow-Credentials", "true");
        context.header("Vary", "Origin");
      } catch {
        // Operation-level validation maps disallowed origins to a safe response.
      }
    }
    await next();
  });

  app.use("*", authHttpBodyLimit);

  app.onError((error, context) => {
    const correlationId = safeCorrelationId(
      context.req.header("X-Correlation-ID"),
    );
    const mapped = mapAuthenticationHttpError(error);
    if (
      mapped.status === 401 &&
      (context.req.path === "/auth/refresh" ||
        context.req.path === "/auth/logout")
    ) {
      context.header("Set-Cookie", policy.clearRefreshCookie());
    }
    if (mapped.retryAfterSeconds) {
      context.header("Retry-After", String(mapped.retryAfterSeconds));
    }
    return context.json(mapped.response(correlationId), mapped.status);
  });

  const assertOrigin = (origin: string | undefined): string => {
    if (!origin) {
      throw new InvalidRequestOriginError();
    }
    policy.assertCookieRequestOrigin(origin);
    return origin;
  };
  const refreshCredential = (cookie: string | undefined) => {
    const credential = getCookie(cookie, policy.refreshCookieName());
    if (!credential) {
      throw new AuthHttpError(
        "authentication_required",
        "Authentication is required.",
        401,
      );
    }
    return credential;
  };
  const bearer = (authorization: string | undefined) =>
    policy.parseBearerAuthorization(authorization ?? null);

  app.options("*", (context) => {
    const origin = assertOrigin(context.req.header("Origin"));
    context.header("Access-Control-Allow-Origin", origin);
    context.header("Access-Control-Allow-Credentials", "true");
    context.header(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, X-Correlation-ID",
    );
    context.header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE");
    context.header("Vary", "Origin");
    return context.body(null, 204);
  });

  app.openapi(
    createRoute({
      method: "get",
      path: "/auth/capabilities",
      responses: {
        200: jsonResponse(AuthCapabilitiesResponseSchema, "Auth capabilities."),
        ...errors,
      },
      tags: ["Authentication"],
    }),
    async (context) => context.json(await operations.capabilities(), 200),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/auth/sign-up",
      request: { body: requestBody(SignUpRequestSchema) },
      responses: {
        202: jsonResponse(SignUpResponseSchema, "Verification is pending."),
        ...errors,
      },
      tags: ["Authentication"],
    }),
    async (context) => {
      assertOrigin(context.req.header("Origin"));
      return context.json(
        await operations.signUp(
          context.req.valid("json"),
          authenticationRequestMetadata(context, policy),
        ),
        202,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/auth/email-verification/resend",
      request: { body: requestBody(EmailVerificationResendRequestSchema) },
      responses: {
        202: jsonResponse(
          EmailVerificationResendResponseSchema,
          "Verification was accepted.",
        ),
        ...errors,
      },
      tags: ["Authentication"],
    }),
    async (context) => {
      assertOrigin(context.req.header("Origin"));
      return context.json(
        await operations.resendEmailVerification(
          context.req.valid("json"),
          authenticationRequestMetadata(context, policy),
        ),
        202,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/auth/email-verification/verify",
      request: { body: requestBody(EmailVerificationVerifyRequestSchema) },
      responses: {
        200: jsonResponse(
          AuthenticationSuccessResponseSchema,
          "Authenticated.",
        ),
        ...errors,
      },
      tags: ["Authentication"],
    }),
    async (context) => {
      assertOrigin(context.req.header("Origin"));
      const result = await operations.verifyEmail(
        context.req.valid("json"),
        authenticationRequestMetadata(context, policy),
      );
      context.header(
        "Set-Cookie",
        policy.createRefreshCookie(
          result.refreshCredential,
          result.response.session.expiresAt,
        ),
      );
      return context.json(result.response, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/auth/login/password",
      request: { body: requestBody(PasswordLoginRequestSchema) },
      responses: {
        200: jsonResponse(PasswordLoginResponseSchema, "Login result."),
        ...errors,
      },
      tags: ["Authentication"],
    }),
    async (context) => {
      assertOrigin(context.req.header("Origin"));
      const result = await operations.loginWithPassword(
        context.req.valid("json"),
        authenticationRequestMetadata(context, policy),
      );
      if (
        result.refreshCredential &&
        result.response.status === "authenticated"
      ) {
        context.header(
          "Set-Cookie",
          policy.createRefreshCookie(
            result.refreshCredential,
            result.response.session.expiresAt,
          ),
        );
      }
      return context.json(result.response, 200);
    },
  );

  registerSessionRoutes({
    app,
    assertOrigin,
    bearer,
    operations,
    policy,
    refreshCredential,
  });
  return app;
}

interface SessionRouteDependencies {
  app: OpenAPIHono;
  assertOrigin(origin: string | undefined): string;
  bearer(authorization: string | undefined): string;
  operations: AuthenticationHttpOperations;
  policy: AuthHttpPolicy;
  refreshCredential(cookie: string | undefined): string;
}

function registerSessionRoutes(input: SessionRouteDependencies): void {
  const { app, assertOrigin, bearer, operations, policy, refreshCredential } =
    input;

  app.openapi(
    createRoute({
      method: "post",
      path: "/auth/refresh",
      request: { body: requestBody(RefreshRequestSchema) },
      responses: {
        200: jsonResponse(
          AuthenticationSuccessResponseSchema,
          "Session refreshed.",
        ),
        ...errors,
      },
      tags: ["Authentication"],
    }),
    async (context) => {
      assertOrigin(context.req.header("Origin"));
      const result = await operations.refresh(
        refreshCredential(context.req.header("Cookie")),
        authenticationRequestMetadata(context, policy),
      );
      context.header(
        "Set-Cookie",
        policy.createRefreshCookie(
          result.refreshCredential,
          result.response.session.expiresAt,
        ),
      );
      return context.json(result.response, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/auth/logout",
      request: { body: requestBody(LogoutRequestSchema) },
      responses: {
        200: jsonResponse(LogoutResponseSchema, "Signed out."),
        ...errors,
      },
      tags: ["Authentication"],
    }),
    async (context) => {
      assertOrigin(context.req.header("Origin"));
      const response = await operations.logout(
        getCookie(context.req.header("Cookie"), policy.refreshCookieName()),
        authenticationRequestMetadata(context, policy),
      );
      context.header("Set-Cookie", policy.clearRefreshCookie());
      return context.json(response, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/auth/logout-all",
      request: { body: requestBody(LogoutAllRequestSchema) },
      responses: {
        200: jsonResponse(LogoutAllResponseSchema, "All sessions revoked."),
        ...errors,
      },
      security: bearerSecurity,
      tags: ["Authentication"],
    }),
    async (context) => {
      assertOrigin(context.req.header("Origin"));
      const response = await operations.logoutAll(
        bearer(context.req.header("Authorization")),
        getCookie(context.req.header("Cookie"), policy.refreshCookieName()),
        authenticationRequestMetadata(context, policy),
      );
      context.header("Set-Cookie", policy.clearRefreshCookie());
      return context.json(response, 200);
    },
  );

  registerPasswordManagementRoutes(input);
}

function registerPasswordManagementRoutes(
  input: SessionRouteDependencies,
): void {
  const { app, assertOrigin, bearer, operations, policy } = input;

  app.openapi(
    createRoute({
      method: "post",
      path: "/auth/password/forgot",
      request: { body: requestBody(ForgotPasswordRequestSchema) },
      responses: {
        202: jsonResponse(ForgotPasswordResponseSchema, "Recovery accepted."),
        ...errors,
      },
      tags: ["Authentication"],
    }),
    async (context) => {
      assertOrigin(context.req.header("Origin"));
      return context.json(
        await operations.forgotPassword(
          context.req.valid("json"),
          authenticationRequestMetadata(context, policy),
        ),
        202,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/auth/password/reset",
      request: { body: requestBody(ResetPasswordRequestSchema) },
      responses: {
        200: jsonResponse(ResetPasswordResponseSchema, "Password reset."),
        ...errors,
      },
      tags: ["Authentication"],
    }),
    async (context) => {
      assertOrigin(context.req.header("Origin"));
      const response = await operations.resetPassword(
        context.req.valid("json"),
        authenticationRequestMetadata(context, policy),
      );
      context.header("Set-Cookie", policy.clearRefreshCookie());
      return context.json(response, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/auth/password/change",
      request: { body: requestBody(ChangePasswordRequestSchema) },
      responses: {
        200: jsonResponse(
          AuthenticationSuccessResponseSchema,
          "Password changed.",
        ),
        ...errors,
      },
      security: bearerSecurity,
      tags: ["Authentication"],
    }),
    async (context) => {
      assertOrigin(context.req.header("Origin"));
      const result = await operations.changePassword(
        bearer(context.req.header("Authorization")),
        context.req.valid("json"),
        authenticationRequestMetadata(context, policy),
      );
      context.header(
        "Set-Cookie",
        policy.createRefreshCookie(
          result.refreshCredential,
          result.response.session.expiresAt,
        ),
      );
      return context.json(result.response, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/users/me",
      responses: {
        200: jsonResponse(CurrentUserResponseSchema, "Current user."),
        ...errors,
      },
      security: bearerSecurity,
      tags: ["Users"],
    }),
    async (context) =>
      context.json(
        await operations.currentUser(
          bearer(context.req.header("Authorization")),
          authenticationRequestMetadata(context, policy),
        ),
        200,
      ),
  );
}
