"use client";
import React, { useCallback, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSidebar } from "@/components/ui/context/SidebarContext";
import { useAuth, type UserRole } from "@/context/AuthContext";
import { useGlobalModal } from "@/context/ModalContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  LayoutDashboard,
  Briefcase,
  Users,
  CalendarDays,
  ListChecks,
  Database,
  Building2,
  Shield,
  FolderOpen,
  Code2,
  Bot,
  LogOut,
  Plus,
  MoreVertical,
  UserCircle2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  name: string;
  icon: LucideIcon;
  path: string;
  /** Which roles can see this item. Undefined = everyone who is logged in. */
  roles?: UserRole[];
  /** Optional data-tour anchor for the product tour to target this nav item. */
  tourKey?: string;
};

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered, toggleMobileSidebar } = useSidebar();
  const { user, logout } = useAuth();
  const { openModal } = useGlobalModal();
  const pathname = usePathname();

  // Sidebar shows expanded state when: manually expanded, mobile drawer open, or hovered
  const open = isExpanded || isHovered || isMobileOpen;

  // Build nav items based on current user role
  const navItems: NavItem[] = useMemo(
    () =>
      [
        { icon: LayoutDashboard, name: "Dashboard", path: "/", tourKey: "nav-dashboard" },
        { icon: Briefcase, name: "Job Openings", path: "/job-openings", tourKey: "nav-job-openings" },
        { icon: Users, name: "Candidates", path: "/candidates", tourKey: "nav-candidates" },
        { icon: CalendarDays, name: "Calendar", path: "/calendar", tourKey: "nav-calendar" },
        { icon: ListChecks, name: "Question Bank", path: "/question-bank", tourKey: "nav-question-bank" },
        { icon: Database, name: "Resume Database", path: "/resume-database", roles: ["super_admin", "admin"], tourKey: "nav-resume-database" },
        { icon: Bot, name: "Talent Agent", path: "/talent", roles: ["super_admin", "admin", "recruiter"], tourKey: "nav-talent-agent" },
        { icon: Building2, name: "Organizations", path: "/organizations", roles: ["super_admin"], tourKey: "nav-organizations" },
        { icon: Shield, name: "Access Control", path: "/access-control", roles: ["super_admin", "admin"], tourKey: "nav-access-control" },
        { icon: FolderOpen, name: "File Manager", path: "/file-manager", roles: ["super_admin"], tourKey: "nav-file-manager" },
        { icon: Code2, name: "Code Sandbox Test", path: "/code-test", roles: ["super_admin"], tourKey: "nav-code-test" },
      ].filter((item) => !item.roles || (user ? item.roles.includes(user.role) : false)) as NavItem[],
    [user],
  );

  const isActive = useCallback(
    (path: string) => (path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(path + "/")),
    [pathname],
  );

  const handleLinkClick = useCallback(() => {
    if (isMobileOpen) toggleMobileSidebar();
  }, [isMobileOpen, toggleMobileSidebar]);

  const getInitials = (name?: string) =>
    !name
      ? "?"
      : name
          .split(" ")
          .map((p) => p[0])
          .filter(Boolean)
          .slice(0, 2)
          .join("")
          .toUpperCase();

  return (
    <aside
      data-tour="sidebar"
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "fixed left-0 top-0 z-50 mt-16 flex h-screen flex-col border-r border-gray-200/80 bg-white text-gray-900 transition-[width] duration-200 ease-out lg:mt-0",
        "dark:border-white/10 dark:bg-gray-950 dark:text-gray-100",
        open ? "w-[260px]" : "w-[84px]",
        isMobileOpen ? "translate-x-0" : "-translate-x-full",
        "lg:translate-x-0",
      )}
      style={{ willChange: "width" }}
    >
      {/* ── Brand ─────────────────────────────────────────────────────────── */}
      <div className={cn("flex h-[72px] items-center px-5", open ? "justify-start" : "lg:justify-center")}>
        <Link href="/" onClick={handleLinkClick} className="flex items-center gap-2">
          {open ? (
            <>
              <Image className="dark:hidden" src="/images/logo/ai.svg" alt="Logo" width={140} height={36} priority />
              <Image className="hidden dark:block" src="/images/logo/ai-white.svg" alt="Logo" width={140} height={36} priority />
            </>
          ) : (
            <Image src="/images/logo/logo-icon.svg" alt="Logo" width={30} height={30} priority />
          )}
        </Link>
      </div>

      {/* ── Nav ───────────────────────────────────────────────────────────── */}
      <nav className="no-scrollbar flex-1 overflow-y-auto px-3 pt-2 pb-4">
        <p
          className={cn(
            "mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400",
            !open && "lg:text-center",
          )}
        >
          {open ? "Menu" : "•••"}
        </p>

        <ul className="flex flex-col gap-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <li key={item.path}>
                <Link
                  href={item.path}
                  onClick={handleLinkClick}
                  aria-current={active ? "page" : undefined}
                  title={!open ? item.name : undefined}
                  data-tour={item.tourKey}
                  className={cn(
                    "group relative flex items-center rounded-xl transition-all duration-150 ease-out",
                    open ? "gap-3 px-3 py-2.5" : "h-10 w-10 mx-auto justify-center",
                    active
                      ? "bg-gradient-to-r from-indigo-500/10 to-purple-500/10 text-indigo-600 dark:from-indigo-500/15 dark:to-purple-500/15 dark:text-indigo-300"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white",
                  )}
                >
                  {/* Active left accent bar */}
                  {active && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-1/2 h-5 w-1 -translate-x-0 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-indigo-500 to-purple-500"
                    />
                  )}

                  {/* Icon */}
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all duration-150",
                      active
                        ? "bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow-sm shadow-indigo-500/30"
                        : "bg-gray-100 text-gray-500 group-hover:bg-gray-200 group-hover:text-gray-700 dark:bg-white/5 dark:text-gray-400 dark:group-hover:bg-white/10",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>

                  {/* Label (only when expanded) */}
                  {open && (
                    <span className={cn("flex-1 truncate text-sm font-medium", active && "font-semibold")}>
                      {item.name}
                    </span>
                  )}

                  {/* Collapsed-mode tooltip */}
                  {!open && (
                    <span
                      className={cn(
                        "pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100",
                        "before:absolute before:left-[-4px] before:top-1/2 before:-translate-y-1/2 before:border-4 before:border-transparent before:border-r-gray-900",
                      )}
                    >
                      {item.name}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* ── Create Opening CTA (sits above the user profile) ──────────────── */}
      <div className={cn("px-3 pb-2", open ? "" : "flex justify-center")} data-tour="create-opening-cta-sidebar">
        <Button
          onClick={openModal}
          title={!open ? "Create Opening" : undefined}
          className={cn(
            "group relative overflow-hidden rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:from-indigo-600 hover:to-purple-600 hover:shadow-lg hover:shadow-indigo-500/25 active:translate-y-0",
            open ? "h-10 w-full justify-start gap-2 px-3 text-sm font-semibold" : "h-10 w-10 p-0",
          )}
        >
          <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
          <Plus className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:rotate-90" />
          {open && <span>Create Opening</span>}
        </Button>
      </div>

      {/* ── User profile footer with menu ─────────────────────────────────── */}
      {user && (
        <div className={cn("border-t border-gray-200/80 p-3 dark:border-white/10", !open && "flex justify-center")} data-tour="user-profile-card">
          {open ? (
            <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-2.5 dark:bg-white/5">
              {/* Avatar w/ online dot */}
              <div className="relative shrink-0">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-xs font-semibold text-white shadow-sm">
                  {getInitials(user.name)}
                </div>
                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-gray-50 dark:ring-gray-950" />
              </div>

              {/* Name + role */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{user.name}</p>
                <p className="truncate text-[11px] font-medium uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
                  {user.role.replace("_", " ")}
                </p>
              </div>

              {/* Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="rounded-md p-1 text-gray-400 hover:bg-gray-200/70 hover:text-gray-600 dark:hover:bg-white/10 dark:hover:text-gray-200"
                    aria-label="Account menu"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="top" className="w-48">
                  <DropdownMenuItem asChild>
                    <Link href="/profile" onClick={handleLinkClick}>
                      <UserCircle2 className="mr-2 h-4 w-4" /> My Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={logout}
                    className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
                  >
                    <LogOut className="mr-2 h-4 w-4" /> Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            // Collapsed: just avatar with dropdown
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="group relative"
                  title={user.name}
                  aria-label="Account menu"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-xs font-semibold text-white shadow-sm">
                    {getInitials(user.name)}
                  </div>
                  <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-gray-950" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="right" className="w-48">
                <div className="px-2 py-1.5 text-xs">
                  <p className="font-semibold text-gray-900 dark:text-white">{user.name}</p>
                  <p className="truncate text-gray-500 dark:text-gray-400">{user.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/profile" onClick={handleLinkClick}>
                    <UserCircle2 className="mr-2 h-4 w-4" /> My Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={logout}
                  className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
                >
                  <LogOut className="mr-2 h-4 w-4" /> Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
    </aside>
  );
};

export default AppSidebar;
