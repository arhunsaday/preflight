import Link from 'next/link';
import { JetBrains_Mono, Manrope } from 'next/font/google';
import {
  Activity,
  ArrowRight,
  Compass,
  Layers,
  Lock,
  Map as MapIcon,
  Package,
  Share2,
  ShieldCheck,
  Terminal,
  Users,
  Monitor,
  Plug,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { AsciiField } from './_landing/ascii-field';
import { CopyCommand } from './_landing/copy-button';
import { DownloadButton, RELEASES } from './_landing/download-button';
import { Shots } from './_landing/shots';
import { Sky } from './_landing/sky';
import { ThemeToggle } from './_landing/theme-toggle';
import './landing.css';

const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jbmono' });

const GITHUB = 'https://github.com/arhunsaday/preflight';

const FEATURES = [
  {
    icon: ShieldCheck,
    title: 'Doctor',
    text: 'Unused context, effort level, overlapping skills, global MCP servers that belong to one project, CLAUDE.md lint. Each finding names the smallest fix.',
    href: '/docs/preflight/cli',
  },
  {
    icon: MapIcon,
    title: 'Context map',
    text: 'A treemap of the instruction text your setup can load, by resource, scope and agent. Estimates are labelled as estimates.',
    href: '/docs/preflight/context-map',
  },
  {
    icon: Activity,
    title: 'Usage and cache',
    text: 'Tokens, cache hit rate and an estimated cost per session, skill, project and day, read from your local transcripts.',
    href: '/docs/preflight/usage',
  },
  {
    icon: Package,
    title: 'Loadouts and profiles',
    text: 'Compose sets of resources, switch profiles, and see the diff before anything is written. Every change can be rolled back.',
    href: '/docs/preflight/cli',
  },
  {
    icon: Compass,
    title: 'Discovery',
    text: 'Search the bundled catalogue, the MCP registry, skills.sh and GitHub. Inspect what a resource contains and asks for before you add it.',
    href: '/docs/preflight/cli',
  },
  {
    icon: Share2,
    title: 'Sharing by link',
    text: 'Publish a setup, send a link, preview it as a diff on the other side. Payloads that contain credentials are rejected.',
    href: '/docs/preflight/sharing',
  },
  {
    icon: Users,
    title: 'Teams',
    text: 'Sign in with GitHub or Google, create a team, invite people and publish shares to it. Local use never needs an account.',
    href: '/docs/preflight/cloudflare-backend',
  },
  {
    icon: Layers,
    title: 'Claude Code, Codex, Cursor',
    text: 'Native adapters for the three. A resource type an agent cannot hold stays inspectable and is marked as catalogued only.',
    href: '/docs/preflight/codex',
  },
];

const INVENTORY = ['skills', 'MCP servers', 'agents', 'hooks', 'plugins', 'instructions'];

export default function HomePage() {
  return (
    <div className={`pf ${manrope.variable} ${mono.variable}`}>
      <header className="pf-nav">
        <div className="pf-wrap pf-nav-in">
          <Link href="/" className="pf-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/img/logo.svg" alt="" width={22} height={23} />
            Preflight
          </Link>
          <nav aria-label="Main">
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
              <Link href="/docs/preflight/quickstart">Quickstart</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
              <Link href="/docs">Docs</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
              <a href={GITHUB}>GitHub</a>
            </Button>
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main>
        <section className="pf-hero">
          <Sky className="pf-sky" />
          <AsciiField className="pf-ascii" />
          <div className="pf-hero-fade" aria-hidden="true" />
          <div className="pf-wrap pf-hero-in">
            <p className="pf-eyebrow">
              <span className="pf-dot" /> For Claude Code, Codex and Cursor
            </p>
            <h1>
              See and fix your
              <br />
              AI coding setup.
            </h1>
            <p className="pf-lede">
              Preflight is the check you run before the session starts: what is installed, what it
              costs in context, and the smallest change that makes it better.
            </p>
            <CopyCommand command="npx @arhunsaday/preflight doctor" className="pf-glass" />
            <div className="pf-actions">
              <DownloadButton />
              <Button asChild variant="outline" size="lg" className="pf-glass">
                <a href={RELEASES}>All platforms</a>
              </Button>
              <Button asChild variant="ghost" size="lg">
                <Link href="/docs">
                  Docs <ArrowRight />
                </Link>
              </Button>
            </div>
            <p className="pf-fine">Free. Runs on your machine. macOS, Windows and Linux.</p>
          </div>
        </section>

        <section className="pf-sec" id="screens">
          <div className="pf-wrap">
            <h2>What you will see</h2>
            <p className="pf-sub">
              The desktop app shows the same engine as the command line. Every write opens a preview
              first and applies only when you confirm it.
            </p>
            <div className="pf-chips" aria-label="What Preflight inventories">
              {INVENTORY.map((x) => (
                <Badge key={x} variant="outline" className="rounded-full px-2.5 font-mono text-muted-foreground">
                  {x}
                </Badge>
              ))}
            </div>
            <Shots />
          </div>
        </section>

        <section className="pf-sec" id="features">
          <div className="pf-wrap">
            <h2>What it does</h2>
            <div className="pf-grid">
              {FEATURES.map(({ icon: Icon, title, text, href }) => (
                <Link key={title} href={href} className="pf-card-link">
                  <Card className="pf-card h-full">
                    <CardHeader className="gap-3">
                      <Icon size={20} aria-hidden="true" />
                      <CardTitle className="text-[17px] font-extrabold tracking-tight">{title}</CardTitle>
                      <CardDescription className="text-[14.5px] leading-relaxed">{text}</CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="pf-sec" id="privacy">
          <div className="pf-wrap pf-privacy">
            <Lock size={22} aria-hidden="true" />
            <div>
              <h2>Local first</h2>
              <p>
                Inventory, Doctor, the context map and usage statistics are computed on your
                computer from your own files and transcripts. Nothing leaves the machine. Sign-in,
                sharing and teams are optional, and a share is only published when you publish it.
              </p>
              <p className="flex flex-wrap items-center gap-1 !text-sm">
                <Button asChild variant="link" className="h-auto px-0">
                  <Link href="/docs/preflight/usage">How usage is counted</Link>
                </Button>
                <span aria-hidden="true">·</span>
                <Button asChild variant="link" className="h-auto px-0">
                  <Link href="/docs/preflight/sharing">What a share contains</Link>
                </Button>
              </p>
            </div>
          </div>
        </section>

        <section className="pf-sec" id="install">
          <div className="pf-wrap">
            <h2>Three ways in</h2>
            <div className="pf-three">
              <Card className="pf-card gap-4">
                <CardHeader className="gap-3">
                  <Terminal size={20} aria-hidden="true" />
                  <CardTitle className="text-[17px] font-extrabold tracking-tight">Command line</CardTitle>
                  <CardDescription className="text-[14.5px] leading-relaxed">Scriptable, JSON on stdout, a terminal interface with `preflight ui`.</CardDescription>
                </CardHeader>
                <div className="px-6">
                  <code className="pf-code">npx @arhunsaday/preflight doctor</code>
                </div>
                <CardFooter className="mt-auto">
                  <Button asChild variant="link" className="h-auto px-0 font-bold">
                    <Link href="/docs/preflight/cli">CLI reference</Link>
                  </Button>
                </CardFooter>
              </Card>
              <Card className="pf-card gap-4">
                <CardHeader className="gap-3">
                  <Monitor size={20} aria-hidden="true" />
                  <CardTitle className="text-[17px] font-extrabold tracking-tight">Desktop app</CardTitle>
                  <CardDescription className="text-[14.5px] leading-relaxed">Electron for macOS, Windows and Linux, with previews, accounts and teams.</CardDescription>
                </CardHeader>
                <div className="px-6">
                  <code className="pf-code">brew install --cask preflight</code>
                </div>
                <CardFooter className="mt-auto">
                  <Button asChild variant="link" className="h-auto px-0 font-bold">
                    <Link href="/docs/preflight/install">Install the app</Link>
                  </Button>
                </CardFooter>
              </Card>
              <Card className="pf-card gap-4">
                <CardHeader className="gap-3">
                  <Plug size={20} aria-hidden="true" />
                  <CardTitle className="text-[17px] font-extrabold tracking-tight">Claude Code plugin</CardTitle>
                  <CardDescription className="text-[14.5px] leading-relaxed">Lets Claude run Doctor and the context map for you, and ask before it applies a change.</CardDescription>
                </CardHeader>
                <div className="px-6">
                  <code className="pf-code">/plugin install preflight@arhun-plugins</code>
                </div>
                <CardFooter className="mt-auto">
                  <Button asChild variant="link" className="h-auto px-0 font-bold">
                    <a href="https://github.com/arhunsaday/claude-plugins">Plugin marketplace</a>
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </div>
        </section>

        <section className="pf-sec pf-end">
          <div className="pf-wrap">
            <h2>Check before you fly.</h2>
            <div className="pf-actions pf-center">
              <Button asChild size="lg">
                <Link href="/docs/preflight/quickstart">Quickstart in five steps</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/docs">Read the docs</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="pf-foot">
        <div className="pf-wrap pf-foot-in">
          <span>Preflight, by Arhun Saday</span>
          <span>
            <Link href="/docs">Docs</Link>
            <a href={GITHUB}>GitHub</a>
            <a href={RELEASES}>Releases</a>
            <a href="https://arhun.fr">arhun.fr</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
