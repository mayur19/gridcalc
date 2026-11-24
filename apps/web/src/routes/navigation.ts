/** Primary navigation. Planned sections stay visible with a badge and their backlog ticket. */
export interface NavItem {
  readonly path: string;
  readonly label: string;
  readonly status: 'available' | 'planned';
  readonly ticket?: string;
  readonly milestone?: string;
  readonly description: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    path: '/workbooks',
    label: 'Workbooks',
    status: 'available',
    description: 'Create workbooks and edit sheets with live formulas.',
  },
  {
    path: '/templates',
    label: 'Templates',
    status: 'planned',
    ticket: 'GC-045',
    milestone: 'M2',
    description: 'Start from budget, forecast and tracker templates.',
  },
  {
    path: '/imports',
    label: 'Import & export',
    status: 'planned',
    ticket: 'GC-085',
    milestone: 'M5',
    description: 'Bring in CSV and XLSX files, export workbooks.',
  },
  {
    path: '/shared',
    label: 'Shared with me',
    status: 'planned',
    ticket: 'GC-098',
    milestone: 'M7',
    description: 'Workbooks other people shared with you.',
  },
  {
    path: '/history',
    label: 'Version history',
    status: 'planned',
    ticket: 'GC-094',
    milestone: 'M7',
    description: 'Browse revisions, name versions and restore them.',
  },
  {
    path: '/pivots',
    label: 'Pivot tables',
    status: 'planned',
    ticket: 'GC-077',
    milestone: 'M8',
    description: 'Summarize ranges by grouping rows and columns.',
  },
  {
    path: '/charts',
    label: 'Charts',
    status: 'planned',
    ticket: 'GC-080',
    milestone: 'M8',
    description: 'Bar, line, area, pie and scatter charts rendered as SVG.',
  },
  {
    path: '/members',
    label: 'Members',
    status: 'planned',
    ticket: 'GC-017',
    milestone: 'M7',
    description: 'Invite people and manage their roles.',
  },
  {
    path: '/audit',
    label: 'Audit log',
    status: 'planned',
    ticket: 'GC-090',
    milestone: 'M7',
    description: 'Search security-relevant events in your organization.',
  },
];

export function findNavItem(path: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => item.path === path);
}
