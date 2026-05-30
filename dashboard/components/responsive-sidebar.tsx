/**
 * Responsive Sidebar Component (CF-WC-086)
 *
 * Collapsible sidebar navigation with mobile drawer support.
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import { handleEscape, trapFocus } from '../lib/accessibility';

interface SidebarProps {
  children?: React.ReactNode;
  logo?: React.ReactNode;
  defaultOpen?: boolean;
}

const SidebarContext = React.createContext<{
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
}>({
  isOpen: false,
  toggle: () => {},
  close: () => {},
});

export function useSidebar() {
  return React.useContext(SidebarContext);
}

export function ResponsiveSidebar({ children, logo, defaultOpen = true }: SidebarProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);
  const [isMobile, setIsMobile] = React.useState(false);
  const sidebarRef = React.useRef<HTMLElement>(null);

  // Detect mobile view
  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth >= 768) {
        setIsOpen(defaultOpen);
      } else {
        setIsOpen(false);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [defaultOpen]);

  // Trap focus in mobile drawer
  React.useEffect(() => {
    if (isMobile && isOpen && sidebarRef.current) {
      return trapFocus(sidebarRef.current);
    }
  }, [isMobile, isOpen]);

  // Close on Escape
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobile && isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isMobile, isOpen]);

  const toggle = () => setIsOpen((prev) => !prev);
  const close = () => setIsOpen(false);

  const value = React.useMemo(
    () => ({ isOpen, toggle, close }),
    [isOpen]
  );

  return (
    <SidebarContext.Provider value={value}>
      {/* Mobile backdrop */}
      {isMobile && isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={close}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        ref={sidebarRef}
        className={`
          fixed top-0 left-0 h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 z-40 transition-transform duration-300 ease-in-out
          ${isMobile ? 'w-64' : isOpen ? 'w-64' : 'w-20'}
          ${isMobile && !isOpen ? '-translate-x-full' : 'translate-x-0'}
          md:translate-x-0
        `}
        aria-label="Sidebar navigation"
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-800">
            {logo}
          </div>

          {/* Content */}
          <nav className="flex-1 overflow-y-auto p-4">
            {children}
          </nav>
        </div>
      </aside>

      {/* Toggle button */}
      <button
        onClick={toggle}
        className="fixed top-4 left-4 z-50 md:hidden p-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700"
        aria-label={isOpen ? 'Close sidebar' : 'Open sidebar'}
        aria-expanded={isOpen}
      >
        <svg
          className="w-6 h-6 text-gray-700 dark:text-gray-300"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          {isOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>
    </SidebarContext.Provider>
  );
}

interface SidebarItemProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
}

export function SidebarItem({ href, icon, label, active = false }: SidebarItemProps) {
  const { isOpen, close } = useSidebar();
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleClick = () => {
    if (isMobile) {
      close();
    }
  };

  return (
    <Link
      href={href}
      onClick={handleClick}
      className={`
        flex items-center gap-3 px-3 py-2 rounded-lg transition-colors
        ${active
          ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
        }
      `}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
    >
      <span className="flex-shrink-0 w-6 h-6" aria-hidden="true">
        {icon}
      </span>
      <span className={`${isOpen ? 'block' : 'hidden md:block'} truncate`}>
        {label}
      </span>
    </Link>
  );
}

export function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  const { isOpen } = useSidebar();

  return (
    <div className="mb-6">
      <h3
        className={`
          text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2 px-3
          ${isOpen ? 'block' : 'hidden md:block'}
        `}
      >
        {title}
      </h3>
      <div className="space-y-1">
        {children}
      </div>
    </div>
  );
}
