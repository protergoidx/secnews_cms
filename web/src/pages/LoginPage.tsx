import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { apiErrorMessage, login } from "../lib/authApi";
import { setToken, setUser } from "../lib/tokenStore";

function ShieldIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

const loginStyles = `
  .login-page {
    --login-bg: #f8fafc;
    --login-panel: #eef2f6;
    --login-card: #ffffff;
    --login-border: #d7dfe8;
    --login-text: #172334;
    --login-muted: #526176;
    --login-input: #ffffff;
    --login-accent: #456b92;
    min-height: 100dvh;
    background: var(--login-bg);
    color: var(--login-text);
  }

  html[data-theme="dark"] .login-page {
    --login-bg: #101722;
    --login-panel: #151f2e;
    --login-card: #1b2738;
    --login-border: #344256;
    --login-text: #edf1f7;
    --login-muted: #a7b3c4;
    --login-input: #141e2c;
    --login-accent: #527ca6;
  }

  .login-page .login-muted {
    color: var(--login-muted);
  }

  .login-page .login-panel {
    background: var(--login-panel);
    border-color: var(--login-border);
  }

  .login-page .login-card {
    background: var(--login-card);
    border-color: var(--login-border);
  }

  #root .login-page .login-input {
    width: 100%;
    border: 1px solid var(--login-border);
    border-radius: 8px;
    background: var(--login-input);
    color: var(--login-text);
    padding: 12px 14px;
    font-size: 14px;
    line-height: 1.5;
  }

  #root .login-page .login-input::placeholder {
    color: var(--login-muted);
    opacity: 0.75;
  }

  #root .login-page .login-input:focus {
    border-color: #779bc0;
    outline: 3px solid rgb(82 124 166 / 15%);
    outline-offset: 1px;
  }

  .login-page .login-submit {
    background: var(--login-accent);
    color: #ffffff;
  }

  .login-page .login-submit:hover:not(:disabled) {
    background: #3e6388;
  }

  .login-page .login-step {
    border-color: var(--login-border);
    color: var(--login-muted);
  }
`;

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(): Promise<void> {
    if (saving) return;

    setSaving(true);
    setError(null);

    try {
      const result = await login(email.trim(), password);

      setToken(result.token);
      setUser(result.user);

      const state: unknown = location.state;

      const from =
        state !== null &&
        typeof state === "object" &&
        "from" in state &&
        typeof state.from === "string" &&
        state.from.startsWith("/") &&
        !state.from.startsWith("//")
          ? state.from
          : "/dashboard";

      navigate(from, { replace: true });
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="login-page grid lg:grid-cols-2">
      <style>{loginStyles}</style>

      <section className="flex min-h-dvh flex-col px-6 py-8 sm:px-12 lg:px-16">
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-xl text-white"
            style={{ background: "#456b92" }}
          >
            <ShieldIcon />
          </span>

          <div>
            <p className="text-base font-semibold">
              SecNews CMS
            </p>
            <p className="login-muted text-xs">
              Security newsroom
            </p>
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-14">
          <div className="mb-8">
            <h1 className="text-3xl font-semibold tracking-tight">
              Welcome back
            </h1>

            <p className="login-muted mt-3 text-sm leading-6">
              Sign in to continue working on your
              security news and bulletins.
            </p>
          </div>

          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <fieldset
              disabled={saving}
              className="min-w-0 space-y-5"
            >
              <div>
                <label
                  htmlFor="login-email"
                  className="mb-2 block text-sm font-medium"
                >
                  Email address
                </label>

                <input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  placeholder="you@company.com"
                  required
                  value={email}
                  onChange={(event) =>
                    setEmail(event.target.value)
                  }
                  className="login-input"
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label
                    htmlFor="login-password"
                    className="text-sm font-medium"
                  >
                    Password
                  </label>

                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword((current) => !current)
                    }
                    aria-controls="login-password"
                    aria-pressed={showPassword}
                    className="login-muted rounded px-1 py-0.5 text-xs hover:underline"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>

                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  required
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                  className="login-input"
                />
              </div>
            </fieldset>

            {error !== null ? (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600"
              >
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={saving}
              className="login-submit flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold disabled:opacity-60"
            >
              {saving ? "Signing in…" : "Sign in"}

              {!saving ? (
                <span aria-hidden="true">→</span>
              ) : null}
            </button>

            <p className="login-muted text-center text-xs leading-5">
              Having trouble signing in? Contact your
              workspace administrator.
            </p>
          </form>
        </div>

        <footer className="login-muted text-xs">
          © {new Date().getFullYear()} SecNews CMS
        </footer>
      </section>

      <aside className="login-panel hidden min-w-0 flex-col justify-center border-l p-10 lg:flex xl:p-16">
        <div className="mx-auto w-full max-w-md">
          <p className="login-muted text-xs font-medium uppercase tracking-widest">
            Your security newsroom
          </p>

          <h2 className="mt-5 text-3xl font-semibold leading-tight tracking-tight xl:text-4xl">
            From the first source
            <br />
            to the final bulletin.
          </h2>

          <p className="login-muted mt-5 text-sm leading-7">
            Keep your sources, indicators, and editorial
            work together. Review the details, prepare
            the story, and share it with confidence.
          </p>

          <div className="login-card mt-9 rounded-xl border p-6">
            <div className="flex items-center gap-3">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: "#79a99b" }}
                aria-hidden="true"
              />
              <p className="text-sm font-medium">
                A clear workflow for every story
              </p>
            </div>

            <div className="mt-6 space-y-5">
              {[
                {
                  title: "Collect",
                  description:
                    "Bring feed items and source links into one place.",
                },
                {
                  title: "Review",
                  description:
                    "Check the content, references, and indicators.",
                },
                {
                  title: "Prepare",
                  description:
                    "Turn reviewed findings into a clear bulletin.",
                },
              ].map((step, index) => (
                <div
                  key={step.title}
                  className="flex items-start gap-3"
                >
                  <span className="login-step flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs">
                    {index + 1}
                  </span>

                  <div>
                    <p className="text-sm font-medium">
                      {step.title}
                    </p>
                    <p className="login-muted mt-1 text-xs leading-5">
                      {step.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="login-muted mt-6 text-xs">
            Built for the people behind every security
            update.
          </p>
        </div>
      </aside>
    </div>
  );
}