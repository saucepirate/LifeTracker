// ── Projects module ───────────────────────────────────────────────────────────

let _projects        = [];
let _projectDetail   = null;
let _projFilter      = 'active';
let _projShowCompleted = false;
let _projDetailTab    = 'overview';
let _projNotes        = [];
let _projGoals        = [];
let _projTrips        = [];
let _projOwnerFilter  = 'all';
let _projNoteEditId   = null;
let _projNoteQuill    = null;
let _projNoteSaveTimer = null;

const PROJ_COLORS = ['cyan','green','amber','red','purple','blue','pink','teal'];

const PROJ_COLOR_HEX = {
  cyan:   'var(--neon-cyan)',
  green:  'var(--neon-green)',
  amber:  'var(--neon-amber)',
  red:    'var(--neon-red)',
  purple: 'var(--neon-purple)',
  blue:   '#4D9FFF',
  pink:   '#FF6090',
  teal:   '#1DE9B6',
};

const TASK_TYPE_ICON = {
  todo:     '☐',
  research: '🔍',
  purchase: '🛒',
  event:    '📅',
};

const TASK_STATUS_ORDER = ['todo','in_progress','blocked','done','skipped'];

// ── Templates ─────────────────────────────────────────────────────────────────

const PROJ_TEMPLATES = [
  {
    id: 'home',
    name: 'Home Project',
    icon: '🏠',
    description: 'Renovations, repairs, and home improvements',
    color: 'amber',
    milestones: [
      { title: 'Planning & Quotes',   ref: 'start',    offset: 0,   is_deliverable: false },
      { title: 'Procurement',         ref: 'start',    offset: 7,   is_deliverable: false },
      { title: 'Execution',           ref: 'start',    offset: 14,  is_deliverable: false },
      { title: 'Finishing & Cleanup', ref: 'deadline', offset: -7,  is_deliverable: false },
      { title: 'Project Complete',    ref: 'deadline', offset: 0,   is_deliverable: true  },
    ],
    tasks: [
      { title: 'Define scope and requirements',  milestone: 0, priority: 'high',   task_type: 'todo',     ref: 'start',    offset: 2   },
      { title: 'Get quotes and estimates',       milestone: 0, priority: 'medium', task_type: 'research', ref: 'start',    offset: 4   },
      { title: 'Set total budget',               milestone: 0, priority: 'high',   task_type: 'todo',     ref: 'start',    offset: 5   },
      { title: 'Pull necessary permits',         milestone: 0, priority: 'medium', task_type: 'todo',     ref: 'start',    offset: 7   },
      { title: 'Purchase materials',             milestone: 1, priority: 'high',   task_type: 'purchase', ref: 'start',    offset: 10  },
      { title: 'Confirm contractor schedule',    milestone: 1, priority: 'high',   task_type: 'todo',     ref: 'start',    offset: 10  },
      { title: 'Begin main work',                milestone: 2, priority: 'high',   task_type: 'todo',     ref: 'start',    offset: 14  },
      { title: 'Mid-project inspection',         milestone: 2, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -14 },
      { title: 'Final walkthrough',              milestone: 3, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -7  },
      { title: 'Document completed work',        milestone: 3, priority: 'low',    task_type: 'todo',     ref: 'deadline', offset: -3  },
      { title: 'Final payment to contractors',   milestone: 3, priority: 'high',   task_type: 'purchase', ref: 'deadline', offset: -1  },
    ],
    note: { title: 'Project Log', content: '<h2>Contacts</h2><p><br></p><h2>Scope of Work</h2><p><br></p><h2>Budget Tracker</h2><p><br></p><h2>Notes &amp; Issues</h2><p><br></p>' },
  },
  {
    id: 'event',
    name: 'Event',
    icon: '🎉',
    description: 'Parties, celebrations, and corporate events',
    color: 'purple',
    milestones: [
      { title: 'Planning',               ref: 'start',    offset: 0,   is_deliverable: false },
      { title: 'Invitations & Vendors',  ref: 'deadline', offset: -45, is_deliverable: false },
      { title: 'Logistics Confirmed',    ref: 'deadline', offset: -21, is_deliverable: false },
      { title: 'Final Prep',             ref: 'deadline', offset: -7,  is_deliverable: false },
      { title: 'Event Day',              ref: 'deadline', offset: 0,   is_deliverable: true  },
    ],
    tasks: [
      { title: 'Define event goals and format',    milestone: 0, priority: 'high',   task_type: 'todo',     ref: 'start',    offset: 2   },
      { title: 'Create guest list',                milestone: 0, priority: 'high',   task_type: 'todo',     ref: 'start',    offset: 3   },
      { title: 'Set budget',                       milestone: 0, priority: 'high',   task_type: 'todo',     ref: 'start',    offset: 5   },
      { title: 'Book venue',                       milestone: 0, priority: 'high',   task_type: 'purchase', ref: 'deadline', offset: -60 },
      { title: 'Send invitations',                 milestone: 1, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -45 },
      { title: 'Book catering',                    milestone: 1, priority: 'high',   task_type: 'purchase', ref: 'deadline', offset: -40 },
      { title: 'Track RSVPs',                      milestone: 1, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -14 },
      { title: 'Confirm AV and tech setup',        milestone: 2, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -14 },
      { title: 'Order decorations and supplies',   milestone: 2, priority: 'medium', task_type: 'purchase', ref: 'deadline', offset: -21 },
      { title: 'Create run of show',               milestone: 3, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -7  },
      { title: 'Final headcount to caterer',       milestone: 3, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -3  },
      { title: 'Prepare day-of supplies bag',      milestone: 3, priority: 'medium', task_type: 'purchase', ref: 'deadline', offset: -2  },
    ],
    note: { title: 'Event Planner', content: '<h2>Guest List</h2><p><br></p><h2>Vendor Contacts</h2><p><br></p><h2>Run of Show</h2><p><br></p><h2>Budget</h2><p><br></p>' },
  },
  {
    id: 'creative',
    name: 'Creative Project',
    icon: '🎨',
    description: 'Design, writing, media, and art projects',
    color: 'pink',
    milestones: [
      { title: 'Concept & Research', ref: 'start',    offset: 7,  is_deliverable: false },
      { title: 'First Draft',        ref: 'start',    offset: 21, is_deliverable: false },
      { title: 'Review & Feedback',  ref: 'start',    offset: 35, is_deliverable: false },
      { title: 'Revisions',          ref: 'start',    offset: 45, is_deliverable: false },
      { title: 'Final Delivery',     ref: 'deadline', offset: 0,  is_deliverable: true  },
    ],
    tasks: [
      { title: 'Define vision, goals, and constraints', milestone: 0, priority: 'high',   task_type: 'todo',     ref: 'start',    offset: 2  },
      { title: 'Research and gather references',        milestone: 0, priority: 'medium', task_type: 'research', ref: 'start',    offset: 5  },
      { title: 'Create outline or mood board',          milestone: 0, priority: 'medium', task_type: 'todo',     ref: 'start',    offset: 7  },
      { title: 'First draft or working prototype',      milestone: 1, priority: 'high',   task_type: 'todo',     ref: 'start',    offset: 21 },
      { title: 'Internal review',                       milestone: 1, priority: 'high',   task_type: 'todo',     ref: 'start',    offset: 25 },
      { title: 'Share with stakeholders',               milestone: 2, priority: 'high',   task_type: 'todo',     ref: 'start',    offset: 35 },
      { title: 'Collect and document feedback',         milestone: 2, priority: 'medium', task_type: 'todo',     ref: 'start',    offset: 38 },
      { title: 'Apply revisions',                       milestone: 3, priority: 'high',   task_type: 'todo',     ref: 'start',    offset: 45 },
      { title: 'Final polish and quality check',        milestone: 3, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -5 },
      { title: 'Deliver final files or publish',        milestone: 4, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: 0  },
    ],
    note: { title: 'Creative Brief', content: '<h2>Vision &amp; Goals</h2><p><br></p><h2>References</h2><p><br></p><h2>Feedback Log</h2><p><br></p><h2>Revision Notes</h2><p><br></p>' },
  },
  {
    id: 'personal_dev',
    name: 'Personal Development',
    icon: '🎯',
    description: 'Learning goals, certifications, and skill-building',
    color: 'green',
    milestones: [
      { title: 'Goal Setting',          ref: 'start',    offset: 3,  is_deliverable: false },
      { title: 'Learning Phase',        ref: 'start',    offset: 30, is_deliverable: false },
      { title: 'Practice & Application', ref: 'start',  offset: 60, is_deliverable: false },
      { title: 'Progress Check',        ref: 'start',    offset: 90, is_deliverable: false },
      { title: 'Goal Achieved',         ref: 'deadline', offset: 0,  is_deliverable: true  },
    ],
    tasks: [
      { title: 'Define SMART goal',                          milestone: 0, priority: 'high',   task_type: 'todo',     ref: 'start',    offset: 2  },
      { title: 'Identify resources, books, and courses',     milestone: 0, priority: 'medium', task_type: 'research', ref: 'start',    offset: 3  },
      { title: 'Create learning schedule',                   milestone: 0, priority: 'high',   task_type: 'todo',     ref: 'start',    offset: 5  },
      { title: 'Complete primary learning material',         milestone: 1, priority: 'high',   task_type: 'todo',     ref: 'start',    offset: 30 },
      { title: 'Summarize key learnings',                    milestone: 1, priority: 'medium', task_type: 'todo',     ref: 'start',    offset: 35 },
      { title: 'Apply skills in a real project or scenario', milestone: 2, priority: 'high',   task_type: 'todo',     ref: 'start',    offset: 60 },
      { title: 'Seek feedback or coaching',                  milestone: 2, priority: 'medium', task_type: 'todo',     ref: 'start',    offset: 70 },
      { title: 'Assess progress against goal',               milestone: 3, priority: 'high',   task_type: 'todo',     ref: 'start',    offset: 90 },
      { title: 'Adjust plan or set next milestone',          milestone: 3, priority: 'medium', task_type: 'todo',     ref: 'start',    offset: 95 },
      { title: 'Document what you learned',                  milestone: 4, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -7 },
    ],
    note: { title: 'Development Log', content: '<h2>Goal Statement</h2><p><br></p><h2>Resources</h2><p><br></p><h2>Progress Notes</h2><p><br></p><h2>Reflections</h2><p><br></p>' },
  },
  // ── Trip planning variants (tripVariant:true — excluded from main template picker) ──
  {
    id: 'trip_1year',
    name: 'Trip Planning — 1 Year Out',
    icon: '✈️',
    description: 'Full 12-month runway: savings, visas, bookings, and prep',
    color: 'cyan',
    tripVariant: true,
    leadLabel: '1 Year',
    leadDays: 365,
    filterLead: '1year', filterDuration: 'any', filterDestination: 'any', filterStyle: 'any',
    milestones: [
      { title: 'Dream & Research',          ref: 'deadline', offset: -360, is_deliverable: false },
      { title: 'Documentation & Finances',  ref: 'deadline', offset: -270, is_deliverable: false },
      { title: 'Bookings Complete',         ref: 'deadline', offset: -150, is_deliverable: false },
      { title: 'Logistics & Activities',    ref: 'deadline', offset: -45,  is_deliverable: false },
      { title: 'Final Prep',               ref: 'deadline', offset: -7,   is_deliverable: false },
      { title: 'Packed & Ready',            ref: 'deadline', offset: -1,   is_deliverable: true  },
    ],
    tasks: [
      { title: 'Research destinations and dream itinerary',  milestone: 0, priority: 'high',   task_type: 'research', ref: 'deadline', offset: -355 },
      { title: 'Set overall travel budget',                  milestone: 0, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -350 },
      { title: 'Open or fund a travel savings account',      milestone: 1, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -270 },
      { title: 'Check passport expiry — renew if needed',    milestone: 1, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -300 },
      { title: 'Research visa requirements',                 milestone: 1, priority: 'high',   task_type: 'research', ref: 'deadline', offset: -280 },
      { title: 'Apply for visas',                            milestone: 1, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -240 },
      { title: 'Book flights',                               milestone: 2, priority: 'high',   task_type: 'purchase', ref: 'deadline', offset: -150 },
      { title: 'Book accommodations',                        milestone: 2, priority: 'high',   task_type: 'purchase', ref: 'deadline', offset: -135 },
      { title: 'Book car rental or ground transport',        milestone: 2, priority: 'medium', task_type: 'purchase', ref: 'deadline', offset: -120 },
      { title: 'Purchase travel insurance',                  milestone: 2, priority: 'medium', task_type: 'purchase', ref: 'deadline', offset: -100 },
      { title: 'Plan detailed itinerary',                    milestone: 3, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -45  },
      { title: 'Reserve activities and restaurants',         milestone: 3, priority: 'medium', task_type: 'purchase', ref: 'deadline', offset: -30  },
      { title: 'Notify bank of travel dates',                milestone: 3, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -14  },
      { title: 'Confirm all bookings received',              milestone: 4, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -7   },
      { title: 'Pack bags',                                  milestone: 5, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -2   },
      { title: 'Check in online',                            milestone: 5, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -1   },
    ],
    note: { title: 'Trip Notes', content: '<h2>Confirmations</h2><p><br></p><h2>Itinerary Ideas</h2><p><br></p><h2>Packing Notes</h2><p><br></p><h2>Budget</h2><p><br></p>' },
  },
  {
    id: 'trip_6month',
    name: 'Trip Planning — 6 Months Out',
    icon: '✈️',
    description: 'Six-month horizon: documentation, bookings, and logistics',
    color: 'cyan',
    tripVariant: true,
    leadLabel: '6 Months',
    leadDays: 180,
    filterLead: '6month', filterDuration: 'any', filterDestination: 'any', filterStyle: 'any',
    milestones: [
      { title: 'Research & Documentation', ref: 'deadline', offset: -175, is_deliverable: false },
      { title: 'Bookings Complete',        ref: 'deadline', offset: -120, is_deliverable: false },
      { title: 'Logistics & Activities',   ref: 'deadline', offset: -30,  is_deliverable: false },
      { title: 'Final Prep',              ref: 'deadline', offset: -7,   is_deliverable: false },
      { title: 'Packed & Ready',           ref: 'deadline', offset: -1,   is_deliverable: true  },
    ],
    tasks: [
      { title: 'Research destinations and set budget',  milestone: 0, priority: 'high',   task_type: 'research', ref: 'deadline', offset: -170 },
      { title: 'Check passport expiry — renew if needed', milestone: 0, priority: 'high', task_type: 'todo',     ref: 'deadline', offset: -165 },
      { title: 'Research and apply for visas',          milestone: 0, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -150 },
      { title: 'Book flights',                          milestone: 1, priority: 'high',   task_type: 'purchase', ref: 'deadline', offset: -120 },
      { title: 'Book accommodations',                   milestone: 1, priority: 'high',   task_type: 'purchase', ref: 'deadline', offset: -105 },
      { title: 'Book car rental or ground transport',   milestone: 1, priority: 'medium', task_type: 'purchase', ref: 'deadline', offset: -90  },
      { title: 'Purchase travel insurance',             milestone: 1, priority: 'medium', task_type: 'purchase', ref: 'deadline', offset: -75  },
      { title: 'Plan detailed itinerary',               milestone: 2, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -30  },
      { title: 'Reserve activities and restaurants',    milestone: 2, priority: 'medium', task_type: 'purchase', ref: 'deadline', offset: -21  },
      { title: 'Notify bank of travel dates',           milestone: 2, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -14  },
      { title: 'Confirm all bookings received',         milestone: 3, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -7   },
      { title: 'Pack bags',                             milestone: 4, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -2   },
      { title: 'Check in online',                       milestone: 4, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -1   },
    ],
    note: { title: 'Trip Notes', content: '<h2>Confirmations</h2><p><br></p><h2>Itinerary Ideas</h2><p><br></p><h2>Packing Notes</h2><p><br></p><h2>Budget</h2><p><br></p>' },
  },
  {
    id: 'trip_3month',
    name: 'Trip Planning — 3 Months Out',
    icon: '✈️',
    description: 'Three-month runway: decisions, bookings, and logistics',
    color: 'cyan',
    tripVariant: true,
    leadLabel: '3 Months',
    leadDays: 90,
    filterLead: '3month', filterDuration: 'any', filterDestination: 'any', filterStyle: 'any',
    milestones: [
      { title: 'Research & Decisions',  ref: 'deadline', offset: -90, is_deliverable: false },
      { title: 'Bookings Complete',     ref: 'deadline', offset: -60, is_deliverable: false },
      { title: 'Logistics Confirmed',   ref: 'deadline', offset: -21, is_deliverable: false },
      { title: 'Packed & Ready',        ref: 'deadline', offset: -1,  is_deliverable: true  },
    ],
    tasks: [
      { title: 'Define trip dates and budget',              milestone: 0, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -90 },
      { title: 'Research destinations and activities',      milestone: 0, priority: 'medium', task_type: 'research', ref: 'deadline', offset: -85 },
      { title: 'Check passport / visa requirements',        milestone: 0, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -80 },
      { title: 'Book flights',                              milestone: 1, priority: 'high',   task_type: 'purchase', ref: 'deadline', offset: -60 },
      { title: 'Book accommodations',                       milestone: 1, priority: 'high',   task_type: 'purchase', ref: 'deadline', offset: -55 },
      { title: 'Book car rental or ground transport',       milestone: 1, priority: 'medium', task_type: 'purchase', ref: 'deadline', offset: -50 },
      { title: 'Purchase travel insurance',                 milestone: 1, priority: 'medium', task_type: 'purchase', ref: 'deadline', offset: -45 },
      { title: 'Plan itinerary and activities',             milestone: 2, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -21 },
      { title: 'Make activity / restaurant reservations',   milestone: 2, priority: 'medium', task_type: 'purchase', ref: 'deadline', offset: -14 },
      { title: 'Notify bank of travel dates',               milestone: 2, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -14 },
      { title: 'Confirm all bookings received',             milestone: 2, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -7  },
      { title: 'Pack bags',                                 milestone: 3, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -2  },
      { title: 'Check in online',                           milestone: 3, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -1  },
    ],
    note: { title: 'Trip Notes', content: '<h2>Confirmations</h2><p><br></p><h2>Itinerary Ideas</h2><p><br></p><h2>Packing Notes</h2><p><br></p><h2>Budget</h2><p><br></p>' },
  },
  {
    id: 'trip_1month',
    name: 'Trip Planning — 1 Month Out',
    icon: '✈️',
    description: 'Last-month sprint: lock down bookings and get ready',
    color: 'cyan',
    tripVariant: true,
    leadLabel: '1 Month',
    leadDays: 30,
    filterLead: '1month', filterDuration: 'any', filterDestination: 'any', filterStyle: 'any',
    milestones: [
      { title: 'Book Immediately',    ref: 'deadline', offset: -28, is_deliverable: false },
      { title: 'Pre-Trip Logistics',  ref: 'deadline', offset: -7,  is_deliverable: false },
      { title: 'Packed & Ready',      ref: 'deadline', offset: -1,  is_deliverable: true  },
    ],
    tasks: [
      { title: 'Book flights (if not already done)',           milestone: 0, priority: 'high',   task_type: 'purchase', ref: 'deadline', offset: -28 },
      { title: 'Book accommodations (if not already done)',    milestone: 0, priority: 'high',   task_type: 'purchase', ref: 'deadline', offset: -25 },
      { title: 'Purchase travel insurance',                    milestone: 0, priority: 'high',   task_type: 'purchase', ref: 'deadline', offset: -20 },
      { title: 'Check passport / visa requirements',           milestone: 0, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -20 },
      { title: 'Plan itinerary',                               milestone: 1, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -7  },
      { title: 'Reserve key activities and restaurants',       milestone: 1, priority: 'medium', task_type: 'purchase', ref: 'deadline', offset: -5  },
      { title: 'Notify bank of travel dates',                  milestone: 1, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -7  },
      { title: 'Confirm all bookings',                         milestone: 1, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -3  },
      { title: 'Pack bags',                                    milestone: 2, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -2  },
      { title: 'Check in online',                              milestone: 2, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -1  },
    ],
    note: { title: 'Trip Notes', content: '<h2>Confirmations</h2><p><br></p><h2>Itinerary Ideas</h2><p><br></p><h2>Packing Notes</h2><p><br></p><h2>Budget</h2><p><br></p>' },
  },
  {
    id: 'trip_weekend',
    name: 'Weekend Getaway',
    icon: '🚗',
    description: 'Quick 2-3 day domestic trip — fast prep, light packing',
    color: 'teal',
    tripVariant: true,
    leadLabel: 'Weekend',
    leadDays: 14,
    filterLead: '1month', filterDuration: 'short', filterDestination: 'domestic', filterStyle: 'mixed',
    milestones: [
      { title: 'Book & Prepare',  ref: 'deadline', offset: -14, is_deliverable: false },
      { title: 'Packed & Ready',  ref: 'deadline', offset: -1,  is_deliverable: true  },
    ],
    tasks: [
      { title: 'Choose destination and dates',            milestone: 0, priority: 'high',   task_type: 'research', ref: 'deadline', offset: -14 },
      { title: 'Book accommodation',                      milestone: 0, priority: 'high',   task_type: 'purchase', ref: 'deadline', offset: -12 },
      { title: 'Plan driving route or book transport',    milestone: 0, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -10 },
      { title: 'Research things to do',                   milestone: 0, priority: 'medium', task_type: 'research', ref: 'deadline', offset: -7  },
      { title: 'Make restaurant reservations',            milestone: 0, priority: 'low',    task_type: 'purchase', ref: 'deadline', offset: -5  },
      { title: 'Download offline maps',                   milestone: 1, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -2  },
      { title: 'Pack bags',                               milestone: 1, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -1  },
      { title: 'Confirm check-in details',                milestone: 1, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -1  },
    ],
    note: { title: 'Trip Notes', content: '<h2>Destination Ideas</h2><p><br></p><h2>Things To Do</h2><p><br></p><h2>Packing List</h2><p><br></p>' },
  },
  {
    id: 'trip_international',
    name: 'International Trip',
    icon: '🌍',
    description: 'Cross-border travel: visas, currency, health prep, and detailed logistics',
    color: 'blue',
    tripVariant: true,
    leadLabel: 'International',
    leadDays: 120,
    filterLead: '6month', filterDuration: 'any', filterDestination: 'international', filterStyle: 'mixed',
    milestones: [
      { title: 'Documents & Visas',  ref: 'deadline', offset: -120, is_deliverable: false },
      { title: 'Flights & Hotels',   ref: 'deadline', offset: -90,  is_deliverable: false },
      { title: 'Money & Health',     ref: 'deadline', offset: -45,  is_deliverable: false },
      { title: 'Final Logistics',    ref: 'deadline', offset: -7,   is_deliverable: false },
      { title: 'Packed & Ready',     ref: 'deadline', offset: -1,   is_deliverable: true  },
    ],
    tasks: [
      { title: 'Check passport — 6+ months validity required',    milestone: 0, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -120 },
      { title: 'Research visa requirements',                       milestone: 0, priority: 'high',   task_type: 'research', ref: 'deadline', offset: -115 },
      { title: 'Apply for visa / travel authorization (ETA etc)',  milestone: 0, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -100 },
      { title: 'Register travel with home country embassy',        milestone: 0, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -90  },
      { title: 'Book flights',                                     milestone: 1, priority: 'high',   task_type: 'purchase', ref: 'deadline', offset: -90  },
      { title: 'Book accommodations',                              milestone: 1, priority: 'high',   task_type: 'purchase', ref: 'deadline', offset: -75  },
      { title: 'Purchase travel insurance',                        milestone: 1, priority: 'high',   task_type: 'purchase', ref: 'deadline', offset: -60  },
      { title: 'Book airport transfers',                           milestone: 1, priority: 'medium', task_type: 'purchase', ref: 'deadline', offset: -45  },
      { title: 'Notify bank — get a travel card or local currency',milestone: 2, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -45  },
      { title: 'Check health requirements (vaccines, pills)',      milestone: 2, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -45  },
      { title: 'Get travel vaccinations if required',              milestone: 2, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -30  },
      { title: 'Plan detailed itinerary',                          milestone: 2, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -30  },
      { title: 'Reserve key activities and tours',                 milestone: 2, priority: 'medium', task_type: 'purchase', ref: 'deadline', offset: -21  },
      { title: 'Confirm all bookings and save copies',             milestone: 3, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -7   },
      { title: 'Pack bags',                                        milestone: 4, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -2   },
      { title: 'Check in online and download boarding passes',     milestone: 4, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -1   },
    ],
    note: { title: 'International Trip Notes', content: '<h2>Visa & Documents</h2><p><br></p><h2>Confirmations</h2><p><br></p><h2>Emergency Contacts</h2><p><br></p><h2>Currency & Budget</h2><p><br></p>' },
  },
  {
    id: 'trip_sightseeing',
    name: 'City & Sightseeing',
    icon: '🏛️',
    description: 'Museum passes, guided tours, bucket-list landmarks, and cultural experiences',
    color: 'purple',
    tripVariant: true,
    leadLabel: 'Sightseeing',
    leadDays: 60,
    filterLead: '3month', filterDuration: 'any', filterDestination: 'any', filterStyle: 'sightseeing',
    milestones: [
      { title: 'Research & Wishlist',   ref: 'deadline', offset: -60, is_deliverable: false },
      { title: 'Book Tickets & Tours',  ref: 'deadline', offset: -30, is_deliverable: false },
      { title: 'Plan Day-by-Day',       ref: 'deadline', offset: -7,  is_deliverable: false },
      { title: 'Packed & Ready',        ref: 'deadline', offset: -1,  is_deliverable: true  },
    ],
    tasks: [
      { title: 'Build wishlist of must-see sites and museums',    milestone: 0, priority: 'high',   task_type: 'research', ref: 'deadline', offset: -60 },
      { title: 'Research opening hours and admission prices',     milestone: 0, priority: 'medium', task_type: 'research', ref: 'deadline', offset: -55 },
      { title: 'Set sightseeing budget',                          milestone: 0, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -50 },
      { title: 'Book flights and accommodation',                  milestone: 0, priority: 'high',   task_type: 'purchase', ref: 'deadline', offset: -45 },
      { title: 'Buy museum / attraction passes',                  milestone: 1, priority: 'high',   task_type: 'purchase', ref: 'deadline', offset: -30 },
      { title: 'Book guided tours or experiences',                milestone: 1, priority: 'medium', task_type: 'purchase', ref: 'deadline', offset: -21 },
      { title: 'Reserve restaurants near key attractions',        milestone: 1, priority: 'low',    task_type: 'purchase', ref: 'deadline', offset: -14 },
      { title: 'Plan day-by-day itinerary',                       milestone: 2, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -7  },
      { title: 'Download city maps and transit apps offline',     milestone: 2, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -5  },
      { title: 'Confirm tour bookings',                           milestone: 2, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -3  },
      { title: 'Pack comfortable walking shoes and day bag',      milestone: 3, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -1  },
    ],
    note: { title: 'Sightseeing Planner', content: '<h2>Must-See List</h2><p><br></p><h2>Tour Bookings</h2><p><br></p><h2>Day-by-Day Plan</h2><p><br></p><h2>Local Tips</h2><p><br></p>' },
  },
  {
    id: 'trip_relaxation',
    name: 'Beach & Relaxation',
    icon: '🏖️',
    description: 'Resort stays, spa days, and stress-free downtime — minimal agenda',
    color: 'teal',
    tripVariant: true,
    leadLabel: 'Relaxation',
    leadDays: 45,
    filterLead: '3month', filterDuration: 'any', filterDestination: 'any', filterStyle: 'relaxation',
    milestones: [
      { title: 'Choose & Book',       ref: 'deadline', offset: -45, is_deliverable: false },
      { title: 'Logistics & Add-ons', ref: 'deadline', offset: -7,  is_deliverable: false },
      { title: 'Ready to Unwind',     ref: 'deadline', offset: -1,  is_deliverable: true  },
    ],
    tasks: [
      { title: 'Research resorts / rental properties',          milestone: 0, priority: 'high',   task_type: 'research', ref: 'deadline', offset: -45 },
      { title: 'Book accommodation',                            milestone: 0, priority: 'high',   task_type: 'purchase', ref: 'deadline', offset: -40 },
      { title: 'Book flights',                                  milestone: 0, priority: 'high',   task_type: 'purchase', ref: 'deadline', offset: -35 },
      { title: 'Purchase travel insurance',                     milestone: 0, priority: 'medium', task_type: 'purchase', ref: 'deadline', offset: -30 },
      { title: 'Book spa or wellness treatments',               milestone: 1, priority: 'medium', task_type: 'purchase', ref: 'deadline', offset: -14 },
      { title: 'Arrange beach / water activity rentals',        milestone: 1, priority: 'low',    task_type: 'purchase', ref: 'deadline', offset: -10 },
      { title: 'Notify bank of travel dates',                   milestone: 1, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -7  },
      { title: 'Set out-of-office and disconnect from work',    milestone: 1, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -3  },
      { title: 'Pack light — beach essentials only',            milestone: 2, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -1  },
    ],
    note: { title: 'Relaxation Trip Notes', content: '<h2>Resort Details</h2><p><br></p><h2>Planned Activities</h2><p><br></p><h2>What to Pack</h2><p><br></p>' },
  },
  {
    id: 'tracker',
    name: 'Long-Term Tracker',
    icon: '📋',
    description: 'Ongoing tracking for car maintenance, home upkeep, personal health, and more',
    color: 'teal',
    is_ongoing: true,
    milestones: [
      { title: 'Initial Assessment', ref: 'start', offset: 7,   is_deliverable: false },
      { title: 'Active Maintenance', ref: 'start', offset: 30,  is_deliverable: false },
      { title: 'Quarterly Review',   ref: 'start', offset: 90,  is_deliverable: false },
      { title: 'Annual Audit',       ref: 'start', offset: 365, is_deliverable: true  },
    ],
    tasks: [
      { title: 'Document current state and baseline',      milestone: 0, priority: 'high',   task_type: 'research', ref: 'start', offset: 3   },
      { title: 'Inventory all items to track',             milestone: 0, priority: 'high',   task_type: 'todo',     ref: 'start', offset: 5   },
      { title: 'Prioritize by urgency and importance',     milestone: 0, priority: 'medium', task_type: 'todo',     ref: 'start', offset: 7   },
      { title: 'Address highest priority items',           milestone: 1, priority: 'high',   task_type: 'todo',     ref: 'start', offset: 14  },
      { title: 'Schedule recurring maintenance items',     milestone: 1, priority: 'high',   task_type: 'todo',     ref: 'start', offset: 21  },
      { title: 'Set up reminders for upcoming deadlines',  milestone: 1, priority: 'medium', task_type: 'todo',     ref: 'start', offset: 30  },
      { title: 'Review completed items and update log',    milestone: 2, priority: 'medium', task_type: 'todo',     ref: 'start', offset: 90  },
      { title: 'Identify upcoming needs for next quarter', milestone: 2, priority: 'medium', task_type: 'research', ref: 'start', offset: 90  },
      { title: 'Full annual review and audit',             milestone: 3, priority: 'high',   task_type: 'todo',     ref: 'start', offset: 365 },
      { title: 'Update priorities and plan for next year', milestone: 3, priority: 'medium', task_type: 'todo',     ref: 'start', offset: 365 },
    ],
    note: { title: 'Tracking Log', content: '<h2>Current Status</h2><p><br></p><h2>History &amp; Service Log</h2><p><br></p><h2>Upcoming Needs</h2><p><br></p><h2>Contacts &amp; Resources</h2><p><br></p>' },
  },
];

function _projRelDate(ref, offset, start, deadline) {
  if (offset == null) return null;
  const base = ref === 'deadline' ? deadline : start;
  if (!base) return null;
  const d = new Date(base + 'T00:00:00');
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

// ── Entry point ───────────────────────────────────────────────────────────────

registerPage('projects', async function(el) {
  el.innerHTML = '<div class="loading-state">Loading…</div>';
  try {
    await _projLoadList();
    _projRenderList(el);
    if (window._openProjectId) {
      const id = window._openProjectId;
      window._openProjectId = null;
      if (_projects.find(p => p.id === id)) await _projOpenDetail(el, id);
    }
  } catch(e) {
    el.innerHTML = `<div class="empty-state"><p class="empty-state-text">Failed to load projects: ${escHtml(e.message)}</p></div>`;
  }
});

async function _projLoadList() {
  const data = await apiFetch('GET', '/projects/');
  _projects = data.items || [];
}

// ── List view ─────────────────────────────────────────────────────────────────

function _projRenderList(el) {
  const filtered = _projects.filter(p => {
    if (_projFilter === 'active')    return p.status === 'active' || p.status === 'paused';
    if (_projFilter === 'completed') return p.status === 'completed';
    return true;
  });

  const filterBar = `
    <div class="proj-filter-bar">
      ${['active','all','completed'].map(f =>
        `<button class="proj-filter-btn${_projFilter===f?' active':''}" data-filter="${f}">${f==='active'?'Active':f==='all'?'All':'Completed'}</button>`
      ).join('')}
      <div style="flex:1"></div>
      <button class="btn btn-secondary" id="proj-template-btn">From Template</button>
      <button class="btn btn-primary" id="proj-new-btn">+ New Project</button>
    </div>`;

  const cards = filtered.length
    ? `<div class="proj-card-grid">${filtered.map(_projCardHTML).join('')}</div>`
    : `<div class="empty-state"><div class="empty-state-title">No projects</div><p class="empty-state-text">Create a project to track complex goals with milestones and tasks.</p></div>`;

  el.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Projects</h1>
    </div>
    ${filterBar}
    ${cards}`;

  el.querySelectorAll('.proj-filter-btn').forEach(b => {
    b.addEventListener('click', () => { _projFilter = b.dataset.filter; _projRenderList(el); });
  });

  el.querySelector('#proj-template-btn').addEventListener('click', () => _projOpenTemplatePickerModal(el));
  el.querySelector('#proj-new-btn').addEventListener('click', () => _projOpenNewModal(el));

  el.querySelectorAll('.proj-card[data-id]').forEach(card => {
    card.addEventListener('click', async e => {
      if (e.target.closest('button')) return;
      await _projOpenDetail(el, parseInt(card.dataset.id));
    });
  });
}

function _projCardHTML(p) {
  const color = PROJ_COLOR_HEX[p.color] || PROJ_COLOR_HEX.cyan;
  const today = todayISO();
  const overdue = p.deadline && p.deadline < today && !['completed','paused','cancelled'].includes(p.status);
  const daysLeft = p.deadline ? Math.ceil((new Date(p.deadline + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000) : null;

  let deadlineHTML = '';
  if (p.deadline) {
    const cls = overdue ? 'proj-deadline--overdue' : daysLeft <= 7 ? 'proj-deadline--soon' : '';
    const label = overdue ? `${Math.abs(daysLeft)}d overdue`
                : daysLeft === 0 ? 'Due today'
                : daysLeft === 1 ? 'Due tomorrow'
                : daysLeft <= 14 ? `${daysLeft}d left`
                : formatDateShort(p.deadline);
    deadlineHTML = `<span class="proj-deadline ${cls}">${label}</span>`;
  }

  const statusBadge = p.status !== 'active'
    ? `<span class="proj-status-badge proj-status-${p.status}">${p.status}</span>`
    : '';

  const ownersHTML = p.owners.length
    ? `<div class="proj-owner-chips">${p.owners.map(o =>
        `<span class="proj-owner-chip" title="${escHtml(o.role)}">${escHtml(o.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase())}</span>`
      ).join('')}</div>`
    : '';

  const progress = p.progress || 0;
  const progressTip = p.has_deliverables
    ? `${progress}% complete · Deliverable tasks count 2× · ${p.task_done}/${p.task_total} tasks done · Cancelled/skipped excluded`
    : `${progress}% complete · ${p.task_done}/${p.task_total} tasks done · Cancelled/skipped tasks excluded`;
  const progressHTML = p.task_total > 0
    ? `<div class="proj-progress-row" title="${progressTip}">
        <div class="proj-progress-bar"><div class="proj-progress-fill" style="width:${progress}%;background:${color}"></div></div>
        <span class="proj-progress-label">${p.task_done}/${p.task_total}${p.has_deliverables ? ' ◆' : ''}</span>
       </div>`
    : '';

  const msHTML = p.milestone_total > 0
    ? `<span class="proj-ms-count">${p.milestone_done}/${p.milestone_total} milestones</span>`
    : '';

  const goalHTML = p.goal_title
    ? `<span class="proj-goal-link">↳ ${escHtml(p.goal_title)}</span>`
    : '';

  const ongoingBadge = p.is_ongoing ? `<span class="proj-ongoing-badge">ongoing</span>` : '';

  return `
    <div class="proj-card" data-id="${p.id}" style="--proj-color:${color}">
      <div class="proj-card-accent"></div>
      <div class="proj-card-body">
        <div class="proj-card-top">
          <span class="proj-card-title">${escHtml(p.title)}</span>
          <div style="display:flex;gap:6px;align-items:center;flex-shrink:0">
            ${statusBadge}${ongoingBadge}
            ${deadlineHTML}
          </div>
        </div>
        ${p.description ? `<p class="proj-card-desc">${escHtml(p.description)}</p>` : ''}
        ${progressHTML}
        <div class="proj-card-footer">
          ${ownersHTML}
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            ${msHTML}${goalHTML}
          </div>
        </div>
      </div>
    </div>`;
}

// ── Health / upcoming / next-action helpers ───────────────────────────────────

function _projComputeHealth(p) {
  const today = todayISO();
  // Terminal / suppressed states — no further checks
  if (p.status === 'completed') return { label: 'Complete',  cls: 'health-complete',  reason: 'Project is complete' };
  if (p.status === 'cancelled') return { label: 'Cancelled', cls: 'health-cancelled', reason: 'Project is cancelled' };
  if (p.status === 'paused')    return { label: 'Paused',    cls: 'health-paused',    reason: 'Project is paused — at-risk/overdue checks suppressed' };

  if (p.deadline && p.deadline < today)
    return { label: 'Overdue', cls: 'health-overdue', reason: `Final deadline was ${formatDateShort(p.deadline)}` };

  // Blocked tasks are excluded — "blocked" means waiting on external dependency, not team failure
  const overdueTasks = (p.tasks || []).filter(t =>
    t.due_date && t.due_date < today &&
    !['done', 'skipped', 'cancelled', 'blocked'].includes(t.status)
  );
  const overdueHigh = overdueTasks.filter(t => t.priority === 'high');
  if (overdueHigh.length >= 1)
    return { label: 'At risk', cls: 'health-atrisk', reason: `High-priority task "${overdueHigh[0].title}" is overdue` };
  if (overdueTasks.length >= 2)
    return { label: 'At risk', cls: 'health-atrisk', reason: `${overdueTasks.length} overdue tasks` };

  const overdueMilestone = (p.milestones || []).find(m => m.due_date && m.due_date < today && m.status !== 'completed');
  if (overdueMilestone)
    return { label: 'At risk', cls: 'health-atrisk', reason: `Milestone "${overdueMilestone.title}" is overdue` };

  if (p.deadline) {
    const d = Math.ceil((new Date(p.deadline+'T00:00:00') - new Date(today+'T00:00:00')) / 86400000);
    if (d <= 14 && p.progress < 50)
      return { label: 'At risk', cls: 'health-atrisk', reason: `${d}d to deadline, only ${p.progress}% done` };
  }

  const nextMs = (p.milestones || [])
    .filter(m => m.due_date && m.status !== 'completed')
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  const reason = nextMs
    ? `Next: ${nextMs.title} by ${formatDateShort(nextMs.due_date)}`
    : p.deadline
      ? `${Math.ceil((new Date(p.deadline+'T00:00:00') - new Date(today+'T00:00:00')) / 86400000)}d to deadline`
      : overdueTasks.length === 1
        ? `1 non-critical overdue task (medium/low priority — not triggering at-risk)`
        : 'No overdue tasks or milestones';
  return { label: 'On track', cls: 'health-ontrack', reason };
}

function _projUpcomingItems(p) {
  const today = todayISO();
  const items = [];
  for (const m of p.milestones)
    if (m.due_date && m.status !== 'completed')
      items.push({ date: m.due_date, label: m.title, type: 'milestone', overdue: m.due_date < today });
  for (const t of p.tasks)
    if (t.due_date && t.status !== 'done' && t.status !== 'skipped')
      items.push({ date: t.due_date, label: t.title, type: 'task', overdue: t.due_date < today });
  if (p.deadline && p.status !== 'completed')
    items.push({ date: p.deadline, label: p.title + ' deadline', type: 'deadline', overdue: p.deadline < today });
  return items.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
}

function _projNextAction(p) {
  const open = p.tasks.filter(t => t.status === 'todo' || t.status === 'in_progress');
  if (!open.length) return null;
  const withDate = open.filter(t => t.due_date)
    .sort((a, b) => {
      if (a.due_date !== b.due_date) return a.due_date.localeCompare(b.due_date);
      return ['high','medium','low'].indexOf(a.priority) - ['high','medium','low'].indexOf(b.priority);
    });
  if (withDate.length) return withDate[0];
  return open.find(t => t.priority === 'high') || open[0];
}

// ── Detail view ───────────────────────────────────────────────────────────────

async function _projOpenDetail(el, projectId) {
  el.innerHTML = '<div class="loading-state">Loading…</div>';
  _projShowCompleted  = false;
  _projDetailTab      = 'overview';
  _projOwnerFilter    = 'all';
  _projNotes          = [];
  _projGoals          = [];
  _projTrips          = [];
  _projNoteEditId     = null;
  _projNoteQuill      = null;
  clearTimeout(_projNoteSaveTimer);
  try {
    _projectDetail = await apiFetch('GET', `/projects/${projectId}`);
    _projRenderDetail(el);
  } catch(e) {
    el.innerHTML = `<div class="empty-state"><p class="empty-state-text">Failed to load project.</p></div>`;
  }
}

function _projRenderDetail(el) {
  const p     = _projectDetail;
  const color = PROJ_COLOR_HEX[p.color] || PROJ_COLOR_HEX.cyan;
  const today = todayISO();
  const health = _projComputeHealth(p);

  // Deadline / time remaining
  const daysLeft = p.deadline
    ? Math.ceil((new Date(p.deadline+'T00:00:00') - new Date(today+'T00:00:00')) / 86400000)
    : null;
  const timeValColor = daysLeft == null ? null
    : daysLeft < 0  ? 'var(--neon-red)'
    : daysLeft <= 14 ? 'var(--neon-amber)'
    : null;
  const timeVal = daysLeft == null ? null
    : daysLeft < 0  ? `${Math.abs(daysLeft)}d overdue`
    : daysLeft === 0 ? 'Today'
    : `${daysLeft}d`;

  // Status / health badges
  const statusLineHTML = `
    <div class="proj-hdr-status-line">
      <span class="proj-hdr-badge proj-hdr-badge--${p.status}">${capitalize(p.status)}</span>
      <span class="proj-hdr-badge-sep">·</span>
      <span class="proj-hdr-badge proj-hdr-badge--health proj-${health.cls}" title="${escHtml(health.reason)}">${health.label}</span>
      ${p.is_ongoing ? `<span class="proj-hdr-badge-sep">·</span><span class="proj-hdr-badge proj-hdr-badge--meta">Ongoing</span>` : ''}
      ${p.goal_title ? `<span class="proj-hdr-badge-sep">·</span><span class="proj-hdr-badge proj-hdr-badge--meta">↳ ${escHtml(p.goal_title)}</span>` : ''}
    </div>`;

  // Stat strip (KPI-card style)
  const progressTip = p.has_deliverables
    ? `Deliverable tasks count 2×\n${p.task_done}/${p.task_total} tasks done\nCancelled/skipped excluded`
    : `${p.task_done}/${p.task_total} tasks done\nCancelled/skipped tasks excluded from total`;
  const statCells = [
    { lbl: 'Progress',   val: `${p.progress}%${p.has_deliverables ? ' ◆' : ''}`, color: color, borderColor: color, bar: p.progress, tip: progressTip },
    { lbl: 'Tasks',      val: `${p.task_done} <small>/ ${p.task_total}</small>`,    color: null,       borderColor: null },
    { lbl: 'Milestones', val: `${p.milestone_done} <small>/ ${p.milestone_total}</small>`, color: null, borderColor: null },
    ...(p.deadline ? [{ lbl: 'Deadline', val: formatDateShort(p.deadline), color: timeValColor, borderColor: timeValColor }] : []),
    ...(timeVal    ? [{ lbl: 'Time left', val: timeVal, color: timeValColor, borderColor: timeValColor }] : []),
  ];
  const statCellsHTML = `<div class="proj-stat-cells">
    ${statCells.map(c => `<div class="proj-stat-cell"${c.borderColor ? ` style="border-top-color:${c.borderColor};box-shadow:var(--shadow-card),0 -1px 10px ${c.borderColor}33"` : ''}${c.tip ? ` title="${escHtml(c.tip)}"` : ''}>
      <div class="proj-stat-lbl">${c.lbl}</div>
      <div class="proj-stat-val"${c.color ? ` style="color:${c.color}"` : ''}>${c.val}</div>
      ${c.bar != null ? `<div class="proj-stat-bar-mini"><div class="proj-stat-bar-mini-fill" style="width:${c.bar}%;background:${c.borderColor}"></div></div>` : ''}
    </div>`).join('')}
  </div>`;

  // Next milestone callout
  const nextMs = p.milestones
    .filter(m => m.status !== 'completed')
    .sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1; if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    })[0];
  const nextMsRemaining = nextMs
    ? p.tasks.filter(t => t.milestone_id === nextMs.id && t.status !== 'done' && t.status !== 'skipped').length
    : 0;
  const nextMsHTML = nextMs ? `
    <div class="proj-hdr-next-ms">
      <span class="proj-hdr-next-ms-lbl">Next milestone</span>
      <span class="proj-hdr-next-ms-icon">◆</span>
      <span class="proj-hdr-next-ms-title">${escHtml(nextMs.title)}</span>
      ${nextMs.due_date ? `<span class="proj-hdr-next-ms-date">${formatDateShort(nextMs.due_date)}</span>` : ''}
      ${nextMsRemaining ? `<span class="proj-hdr-next-ms-tasks">${nextMsRemaining} task${nextMsRemaining>1?'s':''} left</span>` : ''}
    </div>` : '';

  // Owners + schedule
  const ownersRow = p.owners.length ? `<div class="proj-detail-meta">
    ${p.start_date ? `<span class="proj-meta-pill">From ${formatDateShort(p.start_date)}</span>` : ''}
    ${p.owners.map(o => `<span class="proj-owner-chip" title="${escHtml(o.role)}">${escHtml(o.name)}</span>`).join('')}
  </div>` : p.start_date ? `<div class="proj-detail-meta"><span class="proj-meta-pill">From ${formatDateShort(p.start_date)}</span></div>` : '';

  el.innerHTML = `
    <div class="proj-detail-hdr" style="--proj-color:${color}">
      <button class="proj-back-btn" id="proj-back">← Projects</button>
      <div class="proj-detail-title-row">
        <span class="proj-color-dot" style="background:${color}"></span>
        <h2 class="proj-detail-title">${escHtml(p.title)}</h2>
        ${statCellsHTML}
        <details class="proj-header-menu">
          <summary class="proj-header-menu-btn" title="More options">⋯</summary>
          <div class="proj-header-menu-dropdown">
            <button id="proj-edit-btn">Edit project</button>
            <button id="proj-del-btn" class="proj-header-menu-danger">Delete project</button>
          </div>
        </details>
      </div>
      ${p.description ? `<p class="proj-detail-desc">${escHtml(p.description)}</p>` : ''}
      ${statusLineHTML}
      ${nextMsHTML}
      ${ownersRow}
    </div>
    <div class="proj-tab-bar">
      <button class="proj-tab${_projDetailTab==='overview'?' active':''}" data-tab="overview">Overview</button>
      <button class="proj-tab${_projDetailTab==='timeline'?' active':''}" data-tab="timeline">Timeline</button>
      <button class="proj-tab${_projDetailTab==='notes'?' active':''}" data-tab="notes">Notes${_projNotes.length?` <span class="proj-tab-badge">${_projNotes.length}</span>`:''}</button>
      <button class="proj-tab${_projDetailTab==='budget'?' active':''}" data-tab="budget">Budget</button>
    </div>
    <div id="proj-tab-body">${_projTabBodyHTML(p, color, today)}</div>`;

  _projWireDetail(el, p);
}

function _projTabBodyHTML(p, color, today) {
  if (_projDetailTab === 'timeline') return _projTimelineHTML(p, today);
  if (_projDetailTab === 'notes')    return _projNotesHTML(p);
  if (_projDetailTab === 'budget')   return _projBudgetHTML(p, color);
  return `<div class="proj-detail-body-v2">
    <div class="proj-main-col">${_projMainColHTML(p, color, today)}</div>
    <div class="proj-sidebar-col">${_projSidebarHTML(p, color, today)}</div>
  </div>`;
}

function _projTimelineHTML(p, today) {
  const items = [];
  for (const m of p.milestones)
    if (m.due_date) items.push({ date: m.due_date, label: m.title, type: 'milestone',
      done: m.status === 'completed', deliverable: m.is_deliverable });
  for (const t of p.tasks)
    if (t.due_date) items.push({ date: t.due_date, label: t.title, type: 'task',
      done: t.status === 'done' || t.status === 'skipped',
      priority: t.priority, assigned: t.assigned_to });
  if (p.deadline && p.status !== 'completed')
    items.push({ date: p.deadline, label: p.title + ' — Final Deadline', type: 'deadline', done: false });
  items.sort((a, b) => a.date.localeCompare(b.date));

  if (!items.length) return `<div class="empty-state" style="padding:40px 0">
    <p class="empty-state-text">No dated items yet. Add due dates to milestones and tasks to see them here.</p>
  </div>`;

  const groups = {};
  for (const item of items) {
    const key = item.date.substring(0, 7);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }

  return `<div class="proj-timeline">
    <div class="proj-tl-col-hdr">
      <span>Date</span>
      <span></span>
      <span>Item</span>
      <span>Type</span>
      <span>Owner / Status</span>
    </div>
    ${Object.entries(groups).map(([key, gItems]) => {
    const [y, m] = key.split('-');
    const monthLabel = new Date(parseInt(y), parseInt(m) - 1, 1)
      .toLocaleString('default', { month: 'long', year: 'numeric' });

    const byDate = {};
    for (const item of gItems) {
      if (!byDate[item.date]) byDate[item.date] = [];
      byDate[item.date].push(item);
    }

    return `<div class="proj-tl-month">
      <div class="proj-tl-month-hdr">${monthLabel}</div>
      ${Object.entries(byDate).map(([date, dateItems]) =>
        dateItems.map((item, idx) => {
          const overdue = item.date < today && !item.done;
          const isMilestone = item.type === 'milestone' && !item.done;
          const cls = [
            item.done              ? 'proj-tl-item--done'      : '',
            overdue                ? 'proj-tl-item--overdue'   : '',
            isMilestone            ? 'proj-tl-item--milestone'  : '',
            item.type === 'deadline' ? 'proj-tl-item--deadline' : '',
          ].filter(Boolean).join(' ');

          const icon = item.type === 'deadline' ? '🚩'
            : item.type === 'milestone' ? '◆' : '☐';

          const typeBadge = item.type === 'deadline'
            ? `<span class="proj-tl-badge proj-tl-badge--dl">Deadline</span>`
            : item.type === 'milestone'
              ? `<span class="proj-tl-badge proj-tl-badge--ms">Milestone</span>`
              : item.priority === 'high'
                ? `<span class="proj-tl-badge proj-tl-badge--high">High</span>`
                : item.priority === 'low'
                  ? `<span class="proj-tl-badge proj-tl-badge--low">Low</span>`
                  : `<span class="proj-tl-badge proj-tl-badge--med">Task</span>`;

          const statusBadge = item.done
            ? `<span class="proj-tl-done-badge">Done</span>`
            : overdue
              ? `<span class="proj-tl-overdue-badge">Overdue</span>`
              : `<span class="proj-tl-open-badge">Open</span>`;

          const metaHTML = item.type !== 'deadline'
            ? `${item.assigned ? `<span class="proj-tl-owner">${escHtml(item.assigned)}</span>` : ''}${statusBadge}`
            : '';

          return `<div class="proj-tl-item ${cls}">
            <span class="proj-tl-date">${idx === 0 ? formatDateShort(date) : ''}</span>
            <span class="proj-tl-icon">${icon}</span>
            <span class="proj-tl-label">${escHtml(item.label)}${item.deliverable ? ' <span class="proj-deliverable-badge">📦</span>' : ''}</span>
            <span class="proj-tl-col-type">${typeBadge}</span>
            <span class="proj-tl-col-meta">${metaHTML}</span>
          </div>`;
        }).join('')
      ).join('')}
    </div>`;
  }).join('')}</div>`;
}

function _projBudgetHTML(p, color) {
  const estimated = p.tasks.reduce((s, t) => s + (t.estimated_cost || 0), 0);
  const actual    = p.tasks.reduce((s, t) => s + (t.actual_cost    || 0), 0);
  const remaining = estimated - actual;
  const pct       = estimated > 0 ? Math.min(100, Math.round(actual / estimated * 100)) : 0;
  const over      = actual > estimated && estimated > 0;
  const fmt = v => v === 0 ? '$0' : `$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

  // Trip budget banner when this project is linked to a trip
  let tripBudgetBannerHTML = '';
  if (p.trip_id && p.trip_budget_total != null) {
    const cur      = p.trip_budget_currency || 'USD';
    const tripFmt  = v => `${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${cur}`;
    const tripRem  = p.trip_budget_total - (p.trip_budget_total_out || 0);
    const tripPct  = p.trip_budget_total > 0
      ? Math.min(100, Math.round((p.trip_budget_total_out || 0) / p.trip_budget_total * 100)) : 0;
    const tripOver = (p.trip_budget_total_out || 0) > p.trip_budget_total;
    tripBudgetBannerHTML = `
      <div class="proj-trip-budget-banner">
        <div class="proj-trip-budget-hdr">
          <span class="proj-trip-budget-label">✈ Trip Budget</span>
          <span class="proj-trip-budget-vals">
            <span style="color:${tripOver ? 'var(--neon-red)' : 'var(--neon-green)'}">
              ${tripFmt(p.trip_budget_total_out || 0)} spent
            </span>
            <span style="color:var(--text-muted)"> of ${tripFmt(p.trip_budget_total)}</span>
          </span>
        </div>
        <div class="proj-trip-budget-bar-wrap">
          <div class="proj-trip-budget-bar ${tripOver ? 'over' : ''}">
            <div style="width:${tripPct}%"></div>
          </div>
          <span class="proj-trip-budget-bar-lbl ${tripOver ? 'over' : ''}">
            ${tripOver
              ? `${tripFmt((p.trip_budget_total_out || 0) - p.trip_budget_total)} over budget`
              : `${tripPct}% used · ${tripFmt(Math.max(0, tripRem))} remaining`}
          </span>
        </div>
        ${estimated > 0 ? `<div style="font-size:12px;color:var(--text-muted);margin-top:4px">
          Project task estimates: ${fmt(estimated)} · ${Math.round(estimated / p.trip_budget_total * 100)}% of trip budget
        </div>` : ''}
      </div>`;
  }

  const sections = [];
  for (const m of p.milestones) {
    const tasks = p.tasks.filter(t => t.milestone_id === m.id && (t.estimated_cost != null || t.actual_cost != null));
    if (!tasks.length) continue;
    sections.push({ label: m.title,
      est: tasks.reduce((s, t) => s + (t.estimated_cost || 0), 0),
      act: tasks.reduce((s, t) => s + (t.actual_cost    || 0), 0), tasks });
  }
  const genTasks = p.tasks.filter(t => !t.milestone_id && (t.estimated_cost != null || t.actual_cost != null));
  if (genTasks.length) sections.push({ label: 'General',
    est: genTasks.reduce((s, t) => s + (t.estimated_cost || 0), 0),
    act: genTasks.reduce((s, t) => s + (t.actual_cost    || 0), 0), tasks: genTasks });

  const allBudgetTasks = sections.flatMap(s => s.tasks.map(t => ({ ...t, _sectionLabel: s.label })));

  return `<div class="proj-budget">
    ${tripBudgetBannerHTML}
    <div class="proj-budget-summary">
      <div class="proj-budget-kpi">
        <div class="proj-budget-kpi-lbl">Estimated</div>
        <div class="proj-budget-kpi-val">${fmt(estimated)}</div>
      </div>
      <div class="proj-budget-kpi">
        <div class="proj-budget-kpi-lbl">Actual</div>
        <div class="proj-budget-kpi-val" style="color:${actual>0?'var(--neon-amber)':'var(--text-muted)'}">${fmt(actual)}</div>
      </div>
      <div class="proj-budget-kpi">
        <div class="proj-budget-kpi-lbl">Remaining</div>
        <div class="proj-budget-kpi-val" style="color:${over?'var(--neon-red)':remaining>0?'var(--neon-green)':'var(--text-muted)'}">${fmt(Math.abs(remaining))}${over?' over':''}</div>
      </div>
    </div>
    ${estimated > 0 ? `<div class="proj-budget-bar-wrap">
      <div class="proj-budget-bar-wrap .proj-progress-bar" style="height:10px;background:var(--border-subtle);border-radius:5px;overflow:hidden;margin-bottom:5px">
        <div style="height:100%;width:${pct}%;background:${over?'var(--neon-red)':'var(--neon-amber)'};border-radius:5px;transition:width .3s"></div>
      </div>
      <div class="proj-budget-bar-label">${pct}% of budget spent</div>
    </div>` : ''}
    ${sections.length ? `
    <div class="proj-budget-table">
      <div class="proj-budget-tbl-hdr">
        <span>Milestone / Task</span>
        <span>Estimated</span>
        <span>Actual</span>
        <span>Remaining</span>
      </div>
      ${sections.map(s => {
        const sRem = s.est - s.act;
        const sOver = s.act > s.est && s.est > 0;
        return `
        <div class="proj-budget-tbl-group-hdr">
          <span class="proj-budget-tbl-group-name">${escHtml(s.label)}</span>
          <span class="proj-budget-tbl-group-num">${fmt(s.est)}</span>
          <span class="proj-budget-tbl-group-num" style="color:${s.act>0?'var(--neon-amber)':'var(--text-muted)'}">${s.act>0?fmt(s.act):'—'}</span>
          <span class="proj-budget-tbl-group-num" style="color:${sOver?'var(--neon-red)':sRem>0?'var(--neon-green)':'var(--text-muted)'}">${s.est>0?fmt(Math.abs(sRem))+(sOver?' over':''):'—'}</span>
        </div>
        ${s.tasks.map(t => {
          const tRem = (t.estimated_cost||0) - (t.actual_cost||0);
          const tOver = t.actual_cost != null && t.estimated_cost != null && t.actual_cost > t.estimated_cost;
          return `<div class="proj-budget-tbl-row">
            <span class="proj-budget-task-title${t.status==='done'?' done':''}">↳ ${escHtml(t.title)}</span>
            <span class="proj-budget-tbl-num">${t.estimated_cost!=null?fmt(t.estimated_cost):'<span style="opacity:.35">—</span>'}</span>
            <span class="proj-budget-tbl-num">
              ${t.actual_cost!=null
                ? `<span style="color:var(--neon-amber)">${fmt(t.actual_cost)}</span>`
                : `<button class="proj-budget-add-actual" data-action="add-actual" data-id="${t.id}">+ Add actual</button>`}
            </span>
            <span class="proj-budget-tbl-num">${t.estimated_cost!=null&&t.actual_cost!=null
              ? `<span style="color:${tOver?'var(--neon-red)':'var(--neon-green)'}">${fmt(Math.abs(tRem))}${tOver?' over':''}</span>`
              : '<span style="opacity:.35">—</span>'}</span>
          </div>`;
        }).join('')}`;
      }).join('')}
    </div>` : `<div class="empty-state" style="padding:40px 0">
      <p class="empty-state-text">Add estimated costs to tasks to track your project budget here.</p>
    </div>`}
  </div>`;
}

function _projNotesHTML(p) {
  return `<div class="proj-notes-panel">
    <div class="proj-notes-hdr">
      <span style="font-size:13px;font-weight:600;color:var(--text-secondary)">${_projNotes.length} note${_projNotes.length!==1?'s':''}</span>
      <button class="btn btn-primary btn-sm" data-action="new-note">+ Note</button>
    </div>
    ${_projNotes.length ? `<div class="proj-notes-grid">${_projNotes.map(n => {
      const snippet   = _projStripHtml(n.content||'').slice(0,160).trim();
      const linksHTML = _noteCardLinksHTML(n, _projGoals, _projTrips, [], { skipProject: true });
      return `<div class="proj-note-card" data-action="open-note" data-id="${n.id}">
        <div class="proj-note-card-hdr">
          <span class="proj-note-title">${escHtml(n.title||'Untitled')}</span>
          <button class="proj-icon-btn" data-action="del-note" data-id="${n.id}" title="Delete">✕</button>
        </div>
        ${snippet?`<div class="proj-note-snippet">${escHtml(snippet)}</div>`:'<div class="proj-note-snippet" style="opacity:.4;font-style:italic">Empty note</div>'}
        ${linksHTML}
        <div class="proj-note-footer">
          ${n.tags&&n.tags.length?`<div style="display:flex;gap:3px;flex-wrap:wrap">${n.tags.map(t=>`<span class="tag-badge" style="font-size:10px;padding:1px 5px;--tag-color:var(--neon-${t.color||'cyan'})">${escHtml(t.name)}</span>`).join('')}</div>`:'<span></span>'}
          <span class="proj-note-meta">${formatDateShort((n.updated_at||'').substring(0,10))}</span>
        </div>
      </div>`;
    }).join('')}</div>`
    : `<div class="empty-state" style="padding:40px 0">
        <div style="font-size:32px;margin-bottom:10px;opacity:.4">📝</div>
        <p class="empty-state-text">No notes yet.</p>
        <p style="font-size:13px;color:var(--text-muted);max-width:280px;margin:0 auto 16px">Add research, checklists, and confirmations here.</p>
        <button class="btn btn-primary btn-sm" data-action="new-note">+ New note</button>
      </div>`}
  </div>`;
}

function _projStripHtml(html) {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.textContent || d.innerText || '';
}

function _projNoteEditorHTML(note) {
  return `<div class="proj-notes-editor">
    <div class="proj-notes-editor-hdr">
      <button class="btn btn-secondary btn-sm" data-action="notes-back">← Notes</button>
      <input class="proj-note-title-input" id="proj-note-title" value="${escHtml(note.title||'Untitled')}" placeholder="Untitled">
      <span id="proj-note-save-status" class="proj-note-save-status"></span>
      <button class="btn btn-danger btn-sm" data-action="del-note" data-id="${note.id}">Delete</button>
    </div>
    <div class="notes-quill-wrap proj-note-quill-wrap">
      <div id="proj-note-quill"></div>
    </div>
  </div>`;
}

async function _projOpenNoteEditor(el, p, note) {
  _projNoteEditId = note.id;
  clearTimeout(_projNoteSaveTimer);
  const tbody = el.querySelector('#proj-tab-body');
  if (!tbody) return;
  tbody.innerHTML = _projNoteEditorHTML(note);
  await _ensureQuill();
  _projNoteQuill = new Quill('#proj-note-quill', {
    theme: 'snow',
    placeholder: 'Start writing…',
    modules: {
      toolbar: [
        [{ header: [1, 2, 3, false] }],
        ['bold', 'italic', 'underline'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['link', 'blockquote'],
        ['clean'],
      ],
    },
  });
  if (note.content) _projNoteQuill.clipboard.dangerouslyPasteHTML(note.content);
  _projNoteQuill.root.addEventListener('keydown', e => {
    if (e.ctrlKey && !e.shiftKey && e.key === 'k') {
      e.preventDefault();
      const sel = _projNoteQuill.getSelection();
      if (sel && sel.length > 0) {
        const url = prompt('Enter URL:');
        if (url) _projNoteQuill.formatText(sel.index, sel.length, 'link', url);
      }
    }
  }, true);
  const sched = () => {
    const stat = el.querySelector('#proj-note-save-status');
    if (stat) stat.textContent = 'Unsaved…';
    clearTimeout(_projNoteSaveTimer);
    _projNoteSaveTimer = setTimeout(() => _projNoteAutoSave(el, note.id), 1200);
  };
  const titleEl = el.querySelector('#proj-note-title');
  if (titleEl) titleEl.addEventListener('input', sched);
  _projNoteQuill.on('text-change', sched);
  setTimeout(() => _projNoteQuill.focus(), 60);
}

async function _projNoteAutoSave(el, noteId) {
  const title = el.querySelector('#proj-note-title')?.value.trim() || 'Untitled';
  const raw = _projNoteQuill?.root.innerHTML ?? '';
  const content = raw === '<p><br></p>' ? '' : raw;
  try {
    const updated = await apiFetch('PUT', `/notes/${noteId}`, { title, content });
    const idx = _projNotes.findIndex(n => n.id === noteId);
    if (idx >= 0) _projNotes[idx] = updated;
    const stat = el.querySelector('#proj-note-save-status');
    if (stat) { stat.textContent = 'Saved'; setTimeout(() => { const s2 = el.querySelector('#proj-note-save-status'); if (s2) s2.textContent = ''; }, 2000); }
  } catch(e) {
    const stat = el.querySelector('#proj-note-save-status');
    if (stat) stat.textContent = 'Save failed';
  }
}

function _projMainColHTML(p, color, today) {
  // Apply owner filter
  let tasks = p.tasks;
  if (_projOwnerFilter === 'unassigned') tasks = tasks.filter(t => !t.assigned_to);
  else if (_projOwnerFilter !== 'all')   tasks = tasks.filter(t => t.assigned_to === _projOwnerFilter);

  // Build owner filter bar if there are multiple people
  const allPeople = [...new Set([
    ...p.owners.map(o => o.name),
    ...p.tasks.map(t => t.assigned_to).filter(Boolean),
  ])];
  const ownerFilterHTML = allPeople.length ? `
    <div class="proj-owner-filter">
      <button class="proj-owner-filter-btn${_projOwnerFilter==='all'?' active':''}" data-owner-filter="all">All</button>
      ${allPeople.map(n => `<button class="proj-owner-filter-btn${_projOwnerFilter===n?' active':''}" data-owner-filter="${escHtml(n)}">${escHtml(n)}</button>`).join('')}
      <button class="proj-owner-filter-btn${_projOwnerFilter==='unassigned'?' active':''}" data-owner-filter="unassigned">Unassigned</button>
    </div>` : '';

  const sections = p.milestones.map((m, idx) =>
    _projMsSectionHTML(m, tasks.filter(t => t.milestone_id === m.id), p, color, today, idx, p.milestones.length)
  );

  const sortByDueUG = (a, b) => {
    if (!a.due_date && !b.due_date) return 0;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date.localeCompare(b.due_date);
  };
  const ungrouped = tasks.filter(t => !t.milestone_id).sort(sortByDueUG);
  const shownUG   = _projShowCompleted ? ungrouped : ungrouped.filter(t => t.status !== 'done' && t.status !== 'skipped');
  const doneUG    = p.tasks.filter(t => !t.milestone_id && t.status === 'done').length;
  if (p.tasks.filter(t => !t.milestone_id).length || !p.milestones.length) {
    sections.push(`
      <div class="proj-ms-section">
        <div class="proj-ms-sect-hdr proj-ms-sect-hdr--general">
          <span class="proj-ms-sect-title" style="color:var(--text-muted)">General</span>
          ${doneUG && !_projShowCompleted ? `<button class="proj-show-done-btn">${doneUG} done — show</button>` : ''}
          ${_projShowCompleted && doneUG  ? `<button class="proj-show-done-btn">hide done</button>` : ''}
          <div style="flex:1"></div>
          <button class="proj-add-link" data-action="add-task" data-mid="">+ task</button>
        </div>
        ${shownUG.map(t => _projTaskRowHTML(t, p, today)).join('')}
        ${!shownUG.length ? '<div class="proj-ms-empty-tasks">No open tasks</div>' : ''}
        <div class="proj-inline-add"><input class="proj-inline-input" data-mid="" placeholder="Quick add task… (Enter)"></div>
      </div>`);
  }

  return ownerFilterHTML + sections.join('') +
    `<button class="proj-add-ms-btn" id="proj-add-ms">+ Add milestone</button>`;
}

function _projMsSectionHTML(m, tasks, p, color, today, idx = 0, total = 1) {
  const done    = m.status === 'completed';
  const overdue = m.due_date && m.due_date < today && !done;
  const dLeft   = m.due_date && !done ? Math.ceil((new Date(m.due_date+'T00:00:00') - new Date(today+'T00:00:00')) / 86400000) : null;
  const soon    = dLeft != null && !overdue && dLeft <= 7;

  let dateBadge = '';
  if (done) {
    dateBadge = `<span class="proj-ms-date-badge proj-ms-date-done">✓ Done</span>`;
  } else if (overdue) {
    dateBadge = `<span class="proj-ms-date-badge proj-ms-date-overdue">⚠ ${Math.abs(dLeft)}d overdue</span>`;
  } else if (soon) {
    dateBadge = `<span class="proj-ms-date-badge proj-ms-date-soon">Due in ${dLeft}d</span>`;
  } else if (m.due_date) {
    dateBadge = `<span class="proj-ms-date-badge proj-ms-date-future">${formatDateShort(m.due_date)}</span>`;
  }

  const doneCount = tasks.filter(t => t.status === 'done').length;
  const sortByDue = (a, b) => {
    if (!a.due_date && !b.due_date) return 0;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date.localeCompare(b.due_date);
  };
  const sorted = tasks.slice().sort(sortByDue);
  const shown = _projShowCompleted ? sorted : sorted.filter(t => t.status !== 'done' && t.status !== 'skipped');

  return `
    <div class="proj-ms-section${done?' proj-ms-section--done':''}${overdue?' proj-ms-section--overdue':''}">
      <div class="proj-ms-sect-hdr">
        <span class="proj-ms-reorder-btns">
          <button class="proj-icon-btn proj-ms-tri" data-action="ms-up"   data-id="${m.id}" title="Move up"   ${idx === 0         ? 'disabled' : ''}>▲</button>
          <button class="proj-icon-btn proj-ms-tri" data-action="ms-down" data-id="${m.id}" title="Move down" ${idx === total - 1 ? 'disabled' : ''}>▼</button>
        </span>
        <button class="proj-ms-check-node${done?' done':''}" data-action="toggle-ms" data-id="${m.id}"
          style="${done?`background:${color};border-color:${color}`:overdue?'border-color:var(--neon-red)':''}"
          title="${done?'Mark pending':'Mark complete'}">${done?'✓':''}</button>
        <span class="proj-ms-sect-title${done?' proj-ms-sect-title--done':''}">${escHtml(m.title)}</span>
        ${m.is_deliverable ? `<span class="proj-deliverable-badge">📦 deliverable</span>` : ''}
        ${dateBadge}
        ${m.due_date ? `<span style="font-size:10px;color:var(--text-muted);opacity:.5" title="Shown on calendar">📅</span>` : ''}
        ${tasks.length ? `<span class="proj-ms-task-tally">${doneCount}/${tasks.length}</span>` : ''}
        ${doneCount && !_projShowCompleted ? `<button class="proj-show-done-btn">${doneCount} done — show</button>` : ''}
        ${_projShowCompleted && doneCount  ? `<button class="proj-show-done-btn">hide done</button>` : ''}
        <div style="flex:1"></div>
        <button class="proj-add-link" data-action="add-task" data-mid="${m.id}">+ task</button>
        <button class="proj-icon-btn" data-action="edit-ms" data-id="${m.id}" title="Edit milestone">✎</button>
        <button class="proj-icon-btn" data-action="del-ms" data-id="${m.id}" title="Delete milestone">✕</button>
      </div>
      ${tasks.length > 0 ? `<div class="proj-ms-mini-progress"><div class="proj-ms-mini-fill" style="width:${Math.round(doneCount/tasks.length*100)}%;background:${color}"></div></div>` : ''}
      ${m.description ? `<div class="proj-ms-sect-desc">${escHtml(m.description)}</div>` : ''}
      <div class="proj-ms-tasks-wrap">
        ${shown.map(t => _projTaskRowHTML(t, p, today)).join('')}
        ${!shown.length && !done ? `<div class="proj-ms-empty-tasks">No open tasks</div>` : ''}
        <div class="proj-inline-add">
          <input class="proj-inline-input" data-mid="${m.id}" placeholder="Quick add task… (Enter)">
        </div>
      </div>
    </div>`;
}

function _projTaskRowHTML(t, p, today) {
  today = today || todayISO();
  const done    = t.status === 'done';
  const blocked = t.status === 'blocked';
  const skip    = t.status === 'skipped';
  const overdue = t.due_date && t.due_date < today && !done && !skip;

  const chips = [
    t.due_date    ? `<span class="proj-task-chip${overdue?' proj-task-chip--overdue':''}">${overdue?'⚠ ':''}${formatDateShort(t.due_date)}</span>` : '',
    t.assigned_to ? `<span class="proj-task-chip proj-task-chip--owner">${escHtml(t.assigned_to)}</span>` : '',
    t.estimated_cost != null ? `<span class="proj-task-chip" style="color:var(--text-muted)">$${t.estimated_cost.toLocaleString()}</span>` : '',
  ].filter(Boolean).join('');

  const expanded = (t.notes || t.due_date || t.assigned_to || t.estimated_cost != null) ? `
    <div class="proj-task-expand" style="display:none">
      ${t.notes ? `<div class="proj-task-notes">${escHtml(t.notes)}</div>` : ''}
      <div class="proj-task-expand-meta">
        ${t.due_date ? `<span>${overdue?'⚠ ':''}${formatDate(t.due_date)}</span>` : ''}
        ${t.assigned_to ? `<span>→ ${escHtml(t.assigned_to)}</span>` : ''}
        ${t.estimated_cost != null ? `<span>~$${t.estimated_cost.toLocaleString()}</span>` : ''}
        <span style="text-transform:capitalize;color:var(--text-muted)">${t.task_type}</span>
      </div>
    </div>` : '';

  return `
    <div class="proj-task-row-v2${done?' proj-task-row-v2--done':''}${blocked?' proj-task-row-v2--blocked':''}${skip?' proj-task-row-v2--skip':''}" data-tid="${t.id}"${blocked?' title="Blocked — waiting on external dependency (not counted in health)"':''}>
      <button class="proj-task-check${done?' proj-task-check--done':''}" data-action="toggle-task" data-id="${t.id}" title="${done?'Undo':'Mark done'}">✓</button>
      <span class="proj-task-type-icon" title="${t.task_type}">${TASK_TYPE_ICON[t.task_type]||'☐'}</span>
      <span class="priority-dot ${t.priority}" title="${t.priority} priority"></span>
      <span class="proj-task-title-v2${done?' done':''}${skip?' skip':''}">${escHtml(t.title)}</span>
      <div class="proj-task-right">${chips}
        <button class="proj-icon-btn proj-icon-btn--edit" data-action="edit-task" data-id="${t.id}" title="Edit task">✎</button>
        <button class="proj-icon-btn" data-action="del-task" data-id="${t.id}" title="Delete">✕</button>
      </div>
      ${expanded}
    </div>`;
}

function _projSidebarHTML(p, color, today) {
  const parts = [];

  // Deadline card
  if (p.deadline && p.status !== 'completed') {
    const d = Math.ceil((new Date(p.deadline+'T00:00:00') - new Date(today+'T00:00:00')) / 86400000);
    const ov = d < 0, sn = !ov && d <= 14;
    const c  = ov ? 'var(--neon-red)' : sn ? 'var(--neon-amber)' : color;
    parts.push(`
      <div class="proj-sidebar-card" style="border-left:3px solid ${c}">
        <div class="proj-sidebar-label">Final deadline</div>
        <div class="proj-sidebar-deadline-date" style="color:${c}">${formatDate(p.deadline)}</div>
        <div class="proj-sidebar-deadline-days" style="color:${c}">
          ${ov ? `${Math.abs(d)} days overdue` : d === 0 ? 'Due today' : `${d} days left`}
        </div>
      </div>`);
  }

  // Next action card
  const next = _projNextAction(p);
  if (next) {
    const ms = next.milestone_id ? p.milestones.find(m => m.id === next.milestone_id) : null;
    parts.push(`
      <div class="proj-sidebar-card">
        <div class="proj-sidebar-label">Next action</div>
        <div class="proj-sidebar-next-title">${TASK_TYPE_ICON[next.task_type]||'☐'} ${escHtml(next.title)}</div>
        <div class="proj-sidebar-next-meta">
          ${next.due_date    ? `<span>${formatDateShort(next.due_date)}</span>` : ''}
          ${next.assigned_to ? `<span>→ ${escHtml(next.assigned_to)}</span>` : ''}
          ${ms               ? `<span style="color:var(--text-muted)">${escHtml(ms.title)}</span>` : ''}
        </div>
      </div>`);
  }

  // Upcoming panel
  const upcoming = _projUpcomingItems(p);
  if (upcoming.length) {
    parts.push(`
      <div class="proj-sidebar-card">
        <div class="proj-sidebar-label">Upcoming</div>
        ${upcoming.map(item => {
          const icon = item.type === 'deadline' ? '🚩' : item.type === 'milestone' ? '◆' : '☐';
          return `<div class="proj-upcoming-row${item.overdue?' proj-upcoming-row--overdue':''}">
            <span class="proj-upcoming-date">${formatDateShort(item.date)}</span>
            <span class="proj-upcoming-icon">${icon}</span>
            <span class="proj-upcoming-label">${escHtml(item.label)}</span>
          </div>`;
        }).join('')}
      </div>`);
  }

  parts.push(`<button class="proj-add-link" id="proj-add-ms-sb" style="display:block;padding:8px 0;font-size:12px">+ Add milestone</button>`);
  return parts.join('');
}

function _projWireDetail(el, p) {
  // Remove stale delegated listeners before re-attaching
  if (el._projDetailAbort) el._projDetailAbort.abort();
  const ac = new AbortController();
  el._projDetailAbort = ac;
  const sig = { signal: ac.signal };

  const _inTrip = !!el._tripContext;
  const backBtn = el.querySelector('#proj-back');
  if (_inTrip) {
    if (backBtn) backBtn.style.display = 'none';
    const delBtn = el.querySelector('#proj-del-btn');
    if (delBtn) delBtn.style.display = 'none';
  } else {
    backBtn.addEventListener('click', async () => {
      await _projLoadList(); _projRenderList(el);
    }, sig);
  }
  const _closeMenu = () => { const m = el.querySelector('.proj-header-menu'); if (m) m.open = false; };
  el.querySelector('#proj-edit-btn').addEventListener('click', () => { _closeMenu(); _projOpenEditModal(el); }, sig);
  if (!_inTrip) {
    el.querySelector('#proj-del-btn').addEventListener('click', async () => {
      _closeMenu();
      if (!confirm(`Delete "${p.title}"? This cannot be undone.`)) return;
      await apiFetch('DELETE', `/projects/${p.id}`);
      await _projLoadList(); _projRenderList(el);
    }, sig);
  }
  el.querySelectorAll('#proj-add-ms, #proj-add-ms-sb').forEach(b =>
    b.addEventListener('click', () => _projOpenAddMilestoneModal(el), sig)
  );

  // Tab switching
  el.querySelectorAll('.proj-tab[data-tab]').forEach(btn => {
    btn.addEventListener('click', async () => {
      _projDetailTab = btn.dataset.tab;
      if (_projDetailTab === 'notes') {
        try {
          const [nd, gd, td] = await Promise.all([
            apiFetch('GET', `/notes?project_id=${p.id}`),
            apiFetch('GET', '/goals?status=active').catch(() => ({ items: [] })),
            apiFetch('GET', '/trips').catch(() => ({ upcoming: [], planning: [], past: [] })),
          ]);
          _projNotes = nd.items || [];
          _projGoals = gd.items || [];
          _projTrips = [...(td.upcoming || []), ...(td.planning || []), ...(td.past || [])];
        } catch(e) { _projNotes = []; _projGoals = []; _projTrips = []; }
        // Update count badge in tab button
        const notesBtn = el.querySelector('.proj-tab[data-tab="notes"]');
        if (notesBtn) notesBtn.innerHTML = `Notes${_projNotes.length ? ` <span class="proj-tab-badge">${_projNotes.length}</span>` : ''}`;
      }
      el.querySelectorAll('.proj-tab').forEach(b => b.classList.toggle('active', b === btn));
      const tbody = el.querySelector('#proj-tab-body');
      const clr = PROJ_COLOR_HEX[_projectDetail.color] || PROJ_COLOR_HEX.cyan;
      if (tbody) tbody.innerHTML = _projTabBodyHTML(_projectDetail, clr, todayISO());
    }, sig);
  });

  // Owner filter
  el.addEventListener('click', e => {
    const btn = e.target.closest('[data-owner-filter]');
    if (!btn) return;
    _projOwnerFilter = btn.dataset.ownerFilter;
    _projRenderDetail(el);
  }, sig);

  // Delegated actions
  el.addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id ? parseInt(btn.dataset.id) : null;

    if (action === 'toggle-ms') {
      const ms = p.milestones.find(m => m.id === id);
      if (!ms) return;
      try {
        _projectDetail = await apiFetch('PATCH', `/projects/${p.id}/milestones/${id}`,
          { status: ms.status === 'completed' ? 'pending' : 'completed' });
        _projRenderDetail(el);
      } catch(err) { alert('Failed to update milestone: ' + err.message); }
    } else if (action === 'edit-ms') {
      const ms = p.milestones.find(m => m.id === id);
      if (ms) _projOpenEditMilestoneModal(el, ms);
    } else if (action === 'del-ms') {
      if (!confirm('Delete this milestone? Its tasks will move to the General section.')) return;
      await apiFetch('DELETE', `/projects/${p.id}/milestones/${id}`);
      _projectDetail = await apiFetch('GET', `/projects/${p.id}`);
      _projRenderDetail(el);
    } else if (action === 'ms-up' || action === 'ms-down') {
      const milestones = p.milestones;
      const idx = milestones.findIndex(m => m.id === id);
      if (idx < 0) return;
      const swapIdx = action === 'ms-up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= milestones.length) return;
      const newOrder = [...milestones];
      const [moved] = newOrder.splice(idx, 1);
      newOrder.splice(swapIdx, 0, moved);
      try {
        await Promise.all(newOrder.map((ms, i) =>
          apiFetch('PATCH', `/projects/${p.id}/milestones/${ms.id}`, { sort_order: i * 10 })
        ));
        _projectDetail = await apiFetch('GET', `/projects/${p.id}`);
        _projRenderDetail(el);
      } catch(err) { alert('Failed to reorder: ' + err.message); }
    } else if (action === 'toggle-task') {
      const task = p.tasks.find(t => t.id === id);
      if (!task) return;
      const completing = task.status !== 'done';
      try {
        _projectDetail = await apiFetch('PATCH', `/projects/${p.id}/tasks/${id}`,
          { status: task.status === 'done' ? 'todo' : 'done' });
        _projRenderDetail(el);
        if (completing && task.milestone_id) {
          const ms = _projectDetail.milestones.find(m => m.id === task.milestone_id);
          if (ms && ms.status !== 'completed') {
            const msTasks = _projectDetail.tasks.filter(t => t.milestone_id === task.milestone_id);
            if (msTasks.length > 0 && msTasks.every(t => ['done','skipped','cancelled'].includes(t.status))) {
              if (confirm(`All tasks in "${ms.title}" are complete — mark the milestone done?`)) {
                _projectDetail = await apiFetch('PATCH', `/projects/${p.id}/milestones/${ms.id}`, { status: 'completed' });
                _projRenderDetail(el);
              }
            }
          }
        }
      } catch(err) { alert('Failed to update task: ' + err.message); }
    } else if (action === 'del-task') {
      if (!confirm('Delete this task?')) return;
      await apiFetch('DELETE', `/projects/${p.id}/tasks/${id}`);
      _projectDetail = await apiFetch('GET', `/projects/${p.id}`);
      _projRenderDetail(el);
    } else if (action === 'add-task') {
      _projOpenAddTaskModal(el, btn.dataset.mid ? parseInt(btn.dataset.mid) : null);
    } else if (action === 'edit-task') {
      const task = p.tasks.find(t => t.id === id);
      if (task) _projOpenEditTaskModal(el, task);
    } else if (action === 'new-note') {
      try {
        const note = await apiFetch('POST', '/notes', { title: 'Untitled', project_id: p.id });
        _projNotes.unshift(note);
        await _projOpenNoteEditor(el, p, note);
        setTimeout(() => { const t2 = el.querySelector('#proj-note-title'); if (t2) { t2.focus(); t2.select(); } }, 80);
      } catch(err) { alert('Failed to create note: ' + err.message); }
    } else if (action === 'open-note') {
      const note = _projNotes.find(n => n.id === id);
      if (note) await _projOpenNoteEditor(el, p, note);
    } else if (action === 'notes-back') {
      if (_projNoteSaveTimer) { clearTimeout(_projNoteSaveTimer); await _projNoteAutoSave(el, _projNoteEditId); }
      _projNoteEditId = null; _projNoteQuill = null;
      try { const d = await apiFetch('GET', `/notes?project_id=${p.id}`); _projNotes = d.items || []; } catch(e) {}
      const tbackBody = el.querySelector('#proj-tab-body');
      if (tbackBody) tbackBody.innerHTML = _projNotesHTML(p);
    } else if (action === 'del-note') {
      if (!confirm('Delete this note?')) return;
      await apiFetch('DELETE', `/notes/${id}`);
      _projNoteEditId = null; _projNoteQuill = null; clearTimeout(_projNoteSaveTimer);
      try { const d = await apiFetch('GET', `/notes?project_id=${p.id}`); _projNotes = d.items || []; } catch(e) {}
      const tdelBody = el.querySelector('#proj-tab-body');
      if (tdelBody) tdelBody.innerHTML = _projNotesHTML(p);
    } else if (action === 'add-actual') {
      const valStr = prompt('Enter actual cost ($):');
      if (valStr === null) return;
      const cost = parseFloat(valStr);
      if (isNaN(cost)) { alert('Please enter a valid number.'); return; }
      _projectDetail = await apiFetch('PATCH', `/projects/${p.id}/tasks/${id}`, { actual_cost: cost });
      const tbody = el.querySelector('#proj-tab-body');
      const clr = PROJ_COLOR_HEX[_projectDetail.color] || PROJ_COLOR_HEX.cyan;
      if (tbody) tbody.innerHTML = _projBudgetHTML(_projectDetail, clr);
    }
  }, sig);

  // Show/hide completed (delegated — any .proj-show-done-btn)
  el.addEventListener('click', e => {
    if (!e.target.classList.contains('proj-show-done-btn')) return;
    _projShowCompleted = !_projShowCompleted;
    _projRenderDetail(el);
  }, sig);

  // Task row expand
  el.querySelectorAll('.proj-task-row-v2[data-tid]').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('button,input')) return;
      const exp = row.querySelector('.proj-task-expand');
      if (exp) exp.style.display = exp.style.display === 'none' ? '' : 'none';
    });
  });

  // Inline quick-add
  el.querySelectorAll('.proj-inline-input').forEach(input => {
    input.addEventListener('keydown', async e => {
      if (e.key !== 'Enter') return;
      const title = input.value.trim();
      if (!title) return;
      input.value = ''; input.disabled = true;
      const mid = input.dataset.mid ? parseInt(input.dataset.mid) : null;
      try {
        _projectDetail = await apiFetch('POST', `/projects/${p.id}/tasks`, { title, milestone_id: mid || null });
        _projRenderDetail(el);
      } catch(err) { alert(err.message); input.disabled = false; }
    });
  });
}

// ── Modals ────────────────────────────────────────────────────────────────────

function _projGoalOptions() {
  // Returns a datalist + select-able goal list from cache if available
  return '';
}

async function _projOpenNewModal(el, template = null) {
  let goals = [];
  try { goals = (await apiFetch('GET', '/goals?status=active')).items || []; } catch(e) {}

  const goalOptions = goals.map(g => `<option value="${g.id}">${escHtml(g.title)}</option>`).join('');
  const defaultColor = template ? template.color : 'cyan';

  const overlay = createModal(template ? `New Project — ${escHtml(template.name)}` : 'New Project',
    `${template ? `<div class="proj-tmpl-banner">${template.icon} Template: <strong>${escHtml(template.name)}</strong> — set start date and/or deadline to resolve relative task dates.</div>` : ''}
     <div class="form-group">
       <label class="form-label">Title *</label>
       <input class="form-input" id="pm-title" placeholder="Project name" required>
     </div>
     <div class="form-group">
       <label class="form-label">Description</label>
       <textarea class="form-input" id="pm-desc" rows="2" placeholder="What is this project about?"></textarea>
     </div>
     <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
       <div class="form-group">
         <label class="form-label">Start date</label>
         <input type="date" class="form-input" id="pm-start">
       </div>
       <div class="form-group">
         <label class="form-label">Deadline</label>
         <input type="date" class="form-input" id="pm-deadline">
       </div>
     </div>
     <div class="form-group">
       <label class="form-label">Color</label>
       <div class="proj-color-picker" id="pm-color-picker">
         ${PROJ_COLORS.map(c => `<button class="proj-color-swatch${c===defaultColor?' active':''}" data-color="${c}" style="background:${PROJ_COLOR_HEX[c]}" title="${c}"></button>`).join('')}
       </div>
     </div>
     <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
       <div class="form-group">
         <label class="form-label">Link to goal</label>
         <select class="form-input" id="pm-goal">
           <option value="">None</option>
           ${goalOptions}
         </select>
       </div>
       <div class="form-group" style="display:flex;align-items:center;gap:8px;margin-top:22px">
         <input type="checkbox" id="pm-ongoing">
         <label for="pm-ongoing" style="font-size:13px;cursor:pointer">Ongoing project</label>
       </div>
     </div>
     <div class="form-group">
       <label class="form-label">Owners / Collaborators</label>
       <div id="pm-owners-list" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px"></div>
       <div style="display:flex;gap:6px">
         <input class="form-input" id="pm-owner-name" placeholder="Name" style="flex:1">
         <select class="form-input" id="pm-owner-role" style="width:130px">
           <option value="owner">Owner</option>
           <option value="collaborator">Collaborator</option>
         </select>
         <button class="btn btn-secondary" id="pm-add-owner">Add</button>
       </div>
     </div>`,
    async ov => {
      const title = ov.querySelector('#pm-title').value.trim();
      if (!title) { alert('Title is required'); return false; }
      const selectedColor = ov.querySelector('.proj-color-swatch.active')?.dataset.color || defaultColor;
      const goalId = ov.querySelector('#pm-goal').value;
      const owners = [...ov.querySelectorAll('.proj-owner-chip[data-owner]')].map(c => ({
        name: c.dataset.owner, role: c.dataset.role
      }));
      let newProj = await apiFetch('POST', '/projects/', {
        title,
        description: ov.querySelector('#pm-desc').value.trim() || null,
        color: selectedColor,
        start_date: getDateVal(ov.querySelector('#pm-start')) || null,
        deadline:   getDateVal(ov.querySelector('#pm-deadline')) || null,
        goal_id: goalId ? parseInt(goalId) : null,
        is_ongoing: ov.querySelector('#pm-ongoing').checked,
        owners,
      });
      _projects.unshift(newProj);
      if (template) {
        try {
          newProj = await _projApplyTemplateToProject(newProj, template);
          const idx = _projects.findIndex(p => p.id === newProj.id);
          if (idx >= 0) _projects[idx] = newProj;
        } catch(err) {
          console.error('Template application failed:', err);
        }
        _projRenderList(el);
        await _projOpenDetail(el, newProj.id);
      } else {
        _projRenderList(el);
      }
    }, 'Create Project');

  initSmartDates(overlay);

  // Color picker
  overlay.querySelectorAll('.proj-color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      overlay.querySelectorAll('.proj-color-swatch').forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
    });
  });

  // Add owner
  const ownersList = overlay.querySelector('#pm-owners-list');
  overlay.querySelector('#pm-add-owner').addEventListener('click', () => {
    const name = overlay.querySelector('#pm-owner-name').value.trim();
    if (!name) return;
    const role = overlay.querySelector('#pm-owner-role').value;
    const chip = document.createElement('span');
    chip.className = 'proj-owner-chip proj-owner-chip--removable tag-badge';
    chip.dataset.owner = name;
    chip.dataset.role = role;
    chip.innerHTML = `${escHtml(name)} <span style="opacity:.5">(${role})</span> <button class="proj-icon-btn" style="margin-left:4px">✕</button>`;
    chip.querySelector('button').addEventListener('click', () => chip.remove());
    ownersList.appendChild(chip);
    overlay.querySelector('#pm-owner-name').value = '';
  });

  if (template?.is_ongoing) overlay.querySelector('#pm-ongoing').checked = true;

  openModal(overlay);
}

function _projOpenTemplatePickerModal(el) {
  let selectedId = null;

  const cards = PROJ_TEMPLATES.filter(t => !t.tripVariant).map(t => `
    <div class="proj-tmpl-card" data-tmpl="${t.id}">
      <div class="proj-tmpl-top">
        <span class="proj-tmpl-icon">${t.icon}</span>
        <div>
          <div class="proj-tmpl-name">${escHtml(t.name)}</div>
          <div class="proj-tmpl-desc">${escHtml(t.description)}</div>
        </div>
      </div>
      <div class="proj-tmpl-ms-list">
        ${t.milestones.map(m => `<span class="proj-tmpl-ms-item">● ${escHtml(m.title)}</span>`).join('')}
      </div>
    </div>`).join('');

  const overlay = createModal('Start from a Template',
    `<div class="proj-tmpl-grid">${cards}</div>
     <p style="text-align:center;margin-top:12px;font-size:12px;color:var(--text-muted)">Relative due dates are resolved from your project's start date and deadline.</p>`,
    ov => {
      if (!selectedId) { alert('Select a template to continue.'); return false; }
      const tmpl = PROJ_TEMPLATES.find(t => t.id === selectedId);
      closeModal(ov);
      ov.remove();
      _projOpenNewModal(el, tmpl);
      return false;
    }, 'Use Template');

  // "Start blank" shortcut in footer
  const footer = overlay.querySelector('.modal-footer');
  const blankBtn = document.createElement('button');
  blankBtn.className = 'btn btn-secondary';
  blankBtn.textContent = 'Start blank';
  blankBtn.style.marginRight = 'auto';
  blankBtn.addEventListener('click', () => { closeModal(overlay); overlay.remove(); _projOpenNewModal(el); });
  footer.prepend(blankBtn);

  overlay.querySelectorAll('.proj-tmpl-card').forEach(card => {
    card.addEventListener('click', () => {
      overlay.querySelectorAll('.proj-tmpl-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedId = card.dataset.tmpl;
    });
  });

  openModal(overlay);
}

async function _projApplyTemplateToProject(proj, template) {
  const pid = proj.id;
  const start = proj.start_date;
  const deadline = proj.deadline;

  // Create milestones in order; each POST returns the full project
  let current = proj;
  for (let i = 0; i < template.milestones.length; i++) {
    const ms = template.milestones[i];
    current = await apiFetch('POST', `/projects/${pid}/milestones`, {
      title: ms.title,
      description: ms.description || null,
      due_date: _projRelDate(ms.ref, ms.offset, start, deadline),
      is_deliverable: !!ms.is_deliverable,
      sort_order: i,
    });
  }

  // Build title→id map from the final project state
  const msIdByTitle = {};
  for (const m of current.milestones) msIdByTitle[m.title] = m.id;

  // Create tasks
  for (let i = 0; i < template.tasks.length; i++) {
    const t = template.tasks[i];
    const msTitle = t.milestone != null ? template.milestones[t.milestone].title : null;
    await apiFetch('POST', `/projects/${pid}/tasks`, {
      title: t.title,
      milestone_id: msTitle ? (msIdByTitle[msTitle] ?? null) : null,
      priority: t.priority || 'medium',
      task_type: t.task_type || 'todo',
      due_date: _projRelDate(t.ref, t.offset, start, deadline),
      estimated_cost: t.estimated_cost ?? null,
      sort_order: i,
    });
  }

  // Create starter note if template defines one
  if (template.note) {
    try {
      await apiFetch('POST', '/notes', {
        title: `${proj.title} — ${template.note.title}`,
        content: template.note.content,
        project_id: pid,
      });
    } catch(e) { /* non-fatal */ }
  }

  return apiFetch('GET', `/projects/${pid}`);
}

async function _projOpenEditModal(el) {
  const p = _projectDetail;
  let goals = [];
  try { goals = (await apiFetch('GET', '/goals?status=active')).items || []; } catch(e) {}
  const goalOptions = goals.map(g =>
    `<option value="${g.id}" ${p.goal_id===g.id?'selected':''}>${escHtml(g.title)}</option>`
  ).join('');

  const overlay = createModal('Edit Project',
    `<div class="form-group">
       <label class="form-label">Title</label>
       <input class="form-input" id="pm-title" value="${escHtml(p.title)}">
     </div>
     <div class="form-group">
       <label class="form-label">Description</label>
       <textarea class="form-input" id="pm-desc" rows="2">${escHtml(p.description||'')}</textarea>
     </div>
     <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
       <div class="form-group">
         <label class="form-label">Start date</label>
         <input type="date" class="form-input" id="pm-start" value="${p.start_date||''}">
       </div>
       <div class="form-group">
         <label class="form-label">Deadline</label>
         <input type="date" class="form-input" id="pm-deadline" value="${p.deadline||''}">
       </div>
     </div>
     <div class="form-group">
       <label class="form-label">Status</label>
       <select class="form-input" id="pm-status">
         ${['active','paused','completed','cancelled'].map(s =>
           `<option value="${s}" ${p.status===s?'selected':''}>${s}</option>`
         ).join('')}
       </select>
     </div>
     <div class="form-group">
       <label class="form-label">Color</label>
       <div class="proj-color-picker" id="pm-color-picker">
         ${PROJ_COLORS.map(c => `<button class="proj-color-swatch${c===p.color?' active':''}" data-color="${c}" style="background:${PROJ_COLOR_HEX[c]}" title="${c}"></button>`).join('')}
       </div>
     </div>
     <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
       <div class="form-group">
         <label class="form-label">Link to goal</label>
         <select class="form-input" id="pm-goal">
           <option value="">None</option>
           ${goalOptions}
         </select>
       </div>
       <div class="form-group" style="display:flex;align-items:center;gap:8px;margin-top:22px">
         <input type="checkbox" id="pm-ongoing" ${p.is_ongoing?'checked':''}>
         <label for="pm-ongoing" style="font-size:13px;cursor:pointer">Ongoing project</label>
       </div>
     </div>
     <div class="form-group">
       <label class="form-label">Owners / Collaborators</label>
       <div id="pm-owners-list" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px">
         ${p.owners.map(o => `
           <span class="proj-owner-chip proj-owner-chip--removable tag-badge" data-owner="${escHtml(o.name)}" data-role="${o.role}">
             ${escHtml(o.name)} <span style="opacity:.5">(${o.role})</span>
             <button class="proj-icon-btn" style="margin-left:4px">✕</button>
           </span>`).join('')}
       </div>
       <div style="display:flex;gap:6px">
         <input class="form-input" id="pm-owner-name" placeholder="Name" style="flex:1">
         <select class="form-input" id="pm-owner-role" style="width:130px">
           <option value="owner">Owner</option>
           <option value="collaborator">Collaborator</option>
         </select>
         <button class="btn btn-secondary" id="pm-add-owner">Add</button>
       </div>
     </div>`,
    async ov => {
      const title = ov.querySelector('#pm-title').value.trim();
      if (!title) { alert('Title is required'); return false; }
      const selectedColor = ov.querySelector('.proj-color-swatch.active')?.dataset.color || p.color;
      const goalId = ov.querySelector('#pm-goal').value;
      const owners = [...ov.querySelectorAll('.proj-owner-chip[data-owner]')].map(c => ({
        name: c.dataset.owner, role: c.dataset.role
      }));
      _projectDetail = await apiFetch('PATCH', `/projects/${p.id}`, {
        title,
        description: ov.querySelector('#pm-desc').value.trim() || null,
        color: selectedColor,
        status: ov.querySelector('#pm-status').value,
        start_date: getDateVal(ov.querySelector('#pm-start')) || null,
        clear_start_date: !ov.querySelector('#pm-start').value.trim(),
        deadline:   getDateVal(ov.querySelector('#pm-deadline')) || null,
        clear_deadline: !ov.querySelector('#pm-deadline').value.trim(),
        goal_id: goalId ? parseInt(goalId) : null,
        clear_goal_id: !goalId,
        is_ongoing: ov.querySelector('#pm-ongoing').checked,
        owners,
      });
      _projRenderDetail(el);
    }, 'Save');

  initSmartDates(overlay);

  overlay.querySelectorAll('.proj-color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      overlay.querySelectorAll('.proj-color-swatch').forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
    });
  });

  overlay.querySelectorAll('.proj-owner-chip--removable button').forEach(b =>
    b.addEventListener('click', () => b.closest('.proj-owner-chip').remove())
  );

  const ownersList = overlay.querySelector('#pm-owners-list');
  overlay.querySelector('#pm-add-owner').addEventListener('click', () => {
    const name = overlay.querySelector('#pm-owner-name').value.trim();
    if (!name) return;
    const role = overlay.querySelector('#pm-owner-role').value;
    const chip = document.createElement('span');
    chip.className = 'proj-owner-chip proj-owner-chip--removable tag-badge';
    chip.dataset.owner = name;
    chip.dataset.role = role;
    chip.innerHTML = `${escHtml(name)} <span style="opacity:.5">(${role})</span> <button class="proj-icon-btn" style="margin-left:4px">✕</button>`;
    chip.querySelector('button').addEventListener('click', () => chip.remove());
    ownersList.appendChild(chip);
    overlay.querySelector('#pm-owner-name').value = '';
  });

  openModal(overlay);
}

function _projOpenAddMilestoneModal(el) {
  const p = _projectDetail;
  const overlay = createModal('Add Milestone',
    `<div class="form-group">
       <label class="form-label">Title *</label>
       <input class="form-input" id="msm-title" placeholder="Milestone name">
     </div>
     <div class="form-group">
       <label class="form-label">Description</label>
       <input class="form-input" id="msm-desc" placeholder="Optional details">
     </div>
     <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
       <div class="form-group">
         <label class="form-label">Due date</label>
         <input type="date" class="form-input" id="msm-due">
       </div>
       <div class="form-group" style="display:flex;align-items:center;gap:8px;margin-top:22px">
         <input type="checkbox" id="msm-deliv">
         <label for="msm-deliv" style="font-size:13px;cursor:pointer">This is a deliverable</label>
       </div>
     </div>`,
    async ov => {
      const title = ov.querySelector('#msm-title').value.trim();
      if (!title) { alert('Title is required'); return false; }
      _projectDetail = await apiFetch('POST', `/projects/${p.id}/milestones`, {
        title,
        description: ov.querySelector('#msm-desc').value.trim() || null,
        due_date: getDateVal(ov.querySelector('#msm-due')) || null,
        is_deliverable: ov.querySelector('#msm-deliv').checked,
      });
      _projRenderDetail(el);
    }, 'Add Milestone');
  initSmartDates(overlay);
  openModal(overlay);
}

function _projOpenEditMilestoneModal(el, m) {
  const p = _projectDetail;
  const overlay = createModal('Edit Milestone',
    `<div class="form-group">
       <label class="form-label">Title *</label>
       <input class="form-input" id="msm-title" value="${escHtml(m.title)}">
     </div>
     <div class="form-group">
       <label class="form-label">Description</label>
       <input class="form-input" id="msm-desc" value="${escHtml(m.description || '')}" placeholder="Optional details">
     </div>
     <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
       <div class="form-group">
         <label class="form-label">Due date</label>
         <input type="date" class="form-input" id="msm-due" value="${m.due_date || ''}">
       </div>
       <div class="form-group" style="display:flex;align-items:center;gap:8px;margin-top:22px">
         <input type="checkbox" id="msm-deliv" ${m.is_deliverable ? 'checked' : ''}>
         <label for="msm-deliv" style="font-size:13px;cursor:pointer">This is a deliverable</label>
       </div>
     </div>`,
    async ov => {
      const title = ov.querySelector('#msm-title').value.trim();
      if (!title) { alert('Title is required'); return false; }
      const dueVal = ov.querySelector('#msm-due').value;
      const body = {
        title,
        description: ov.querySelector('#msm-desc').value.trim() || null,
        is_deliverable: ov.querySelector('#msm-deliv').checked,
      };
      if (dueVal) body.due_date = dueVal;
      else if (m.due_date) body.clear_due_date = true;
      _projectDetail = await apiFetch('PATCH', `/projects/${p.id}/milestones/${m.id}`, body);
      _projRenderDetail(el);
    }, 'Save');
  initSmartDates(overlay);
  openModal(overlay);
}

function _projPeopleOptions(p, selectedName) {
  const people = [...new Set([
    ...p.owners.map(o => o.name),
    ...p.tasks.map(t => t.assigned_to).filter(Boolean),
  ])];
  return people.map(n =>
    `<option value="${escHtml(n)}" ${selectedName===n?'selected':''}>${escHtml(n)}</option>`
  ).join('');
}

function _projOpenAddTaskModal(el, milestoneId) {
  const p = _projectDetail;
  const msOptions = p.milestones.map(m =>
    `<option value="${m.id}" ${m.id===milestoneId?'selected':''}>${escHtml(m.title)}</option>`
  ).join('');
  const peopleOpts = _projPeopleOptions(p, null);

  const overlay = createModal('Add Task',
    `<div class="form-group">
       <label class="form-label">Title *</label>
       <input class="form-input" id="tm-title" placeholder="What needs to be done?">
     </div>
     <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
       <div class="form-group">
         <label class="form-label">Type</label>
         <select class="form-input" id="tm-type">
           <option value="todo">To-do</option>
           <option value="research">Research</option>
           <option value="purchase">Purchase</option>
           <option value="event">Event</option>
         </select>
       </div>
       <div class="form-group">
         <label class="form-label">Priority</label>
         <select class="form-input" id="tm-priority">
           <option value="high">High</option>
           <option value="medium" selected>Medium</option>
           <option value="low">Low</option>
         </select>
       </div>
       <div class="form-group">
         <label class="form-label">Due date</label>
         <input type="date" class="form-input" id="tm-due">
       </div>
     </div>
     <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
       <div class="form-group">
         <label class="form-label">Milestone</label>
         <select class="form-input" id="tm-ms">
           <option value="">None (general)</option>
           ${msOptions}
         </select>
       </div>
       <div class="form-group">
         <label class="form-label">Assigned to</label>
         <select class="form-input" id="tm-assigned">
           <option value="">Unassigned</option>
           ${peopleOpts}
         </select>
       </div>
     </div>
     <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
       <div class="form-group">
         <label class="form-label">Est. cost ($)</label>
         <input type="number" class="form-input" id="tm-cost" placeholder="0.00" min="0" step="0.01">
       </div>
     </div>
     <div class="form-group">
       <label class="form-label">Notes</label>
       <textarea class="form-input" id="tm-notes" rows="2" placeholder="Additional details…"></textarea>
     </div>`,
    async ov => {
      const title = ov.querySelector('#tm-title').value.trim();
      if (!title) { alert('Title is required'); return false; }
      const msVal = ov.querySelector('#tm-ms').value;
      const costVal = ov.querySelector('#tm-cost').value;
      _projectDetail = await apiFetch('POST', `/projects/${p.id}/tasks`, {
        title,
        task_type: ov.querySelector('#tm-type').value,
        priority:  ov.querySelector('#tm-priority').value,
        due_date:  getDateVal(ov.querySelector('#tm-due')) || null,
        milestone_id: msVal ? parseInt(msVal) : null,
        assigned_to: ov.querySelector('#tm-assigned').value || null,
        estimated_cost: costVal ? parseFloat(costVal) : null,
        notes: ov.querySelector('#tm-notes').value.trim() || null,
      });
      _projRenderDetail(el);
    }, 'Add Task');
  initSmartDates(overlay);
  openModal(overlay);
}

function _projOpenEditTaskModal(el, task) {
  const p = _projectDetail;
  const msOptions = p.milestones.map(m =>
    `<option value="${m.id}" ${m.id===task.milestone_id?'selected':''}>${escHtml(m.title)}</option>`
  ).join('');
  const peopleOpts = _projPeopleOptions(p, task.assigned_to);

  const overlay = createModal('Edit Task',
    `<div class="form-group">
       <label class="form-label">Title *</label>
       <input class="form-input" id="tm-title" value="${escHtml(task.title)}">
     </div>
     <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
       <div class="form-group">
         <label class="form-label">Type</label>
         <select class="form-input" id="tm-type">
           <option value="todo" ${task.task_type==='todo'?'selected':''}>To-do</option>
           <option value="research" ${task.task_type==='research'?'selected':''}>Research</option>
           <option value="purchase" ${task.task_type==='purchase'?'selected':''}>Purchase</option>
           <option value="event" ${task.task_type==='event'?'selected':''}>Event</option>
         </select>
       </div>
       <div class="form-group">
         <label class="form-label">Priority</label>
         <select class="form-input" id="tm-priority">
           <option value="high" ${task.priority==='high'?'selected':''}>High</option>
           <option value="medium" ${task.priority==='medium'?'selected':''}>Medium</option>
           <option value="low" ${task.priority==='low'?'selected':''}>Low</option>
         </select>
       </div>
       <div class="form-group">
         <label class="form-label">Status</label>
         <select class="form-input" id="tm-status">
           <option value="todo" ${task.status==='todo'?'selected':''}>To-do</option>
           <option value="in_progress" ${task.status==='in_progress'?'selected':''}>In progress</option>
           <option value="blocked" ${task.status==='blocked'?'selected':''}>Blocked (waiting on dependency)</option>
           <option value="done" ${task.status==='done'?'selected':''}>Done</option>
           <option value="skipped" ${task.status==='skipped'?'selected':''}>Skipped</option>
         </select>
       </div>
     </div>
     <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
       <div class="form-group">
         <label class="form-label">Due date</label>
         <input type="date" class="form-input" id="tm-due" value="${task.due_date||''}">
       </div>
       <div class="form-group">
         <label class="form-label">Assigned to</label>
         <select class="form-input" id="tm-assigned">
           <option value="">Unassigned</option>
           ${peopleOpts}
         </select>
       </div>
     </div>
     <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
       <div class="form-group">
         <label class="form-label">Milestone</label>
         <select class="form-input" id="tm-ms">
           <option value="" ${!task.milestone_id?'selected':''}>None (general)</option>
           ${msOptions}
         </select>
       </div>
       <div class="form-group">
         <label class="form-label">Est. cost ($)</label>
         <input type="number" class="form-input" id="tm-cost" placeholder="0.00" min="0" step="0.01" value="${task.estimated_cost??''}">
       </div>
     </div>
     <div class="form-group">
       <label class="form-label">Notes</label>
       <textarea class="form-input" id="tm-notes" rows="3" placeholder="Additional details…">${escHtml(task.notes||'')}</textarea>
     </div>`,
    async ov => {
      const title = ov.querySelector('#tm-title').value.trim();
      if (!title) { alert('Title is required'); return false; }
      const msVal    = ov.querySelector('#tm-ms').value;
      const costVal  = ov.querySelector('#tm-cost').value;
      const assigned = ov.querySelector('#tm-assigned').value;
      const dueVal   = getDateVal(ov.querySelector('#tm-due'));
      _projectDetail = await apiFetch('PATCH', `/projects/${p.id}/tasks/${task.id}`, {
        title,
        task_type: ov.querySelector('#tm-type').value,
        priority:  ov.querySelector('#tm-priority').value,
        status:    ov.querySelector('#tm-status').value,
        due_date:  dueVal || null,
        clear_due_date: !dueVal,
        milestone_id:   msVal ? parseInt(msVal) : null,
        clear_milestone_id: !msVal,
        assigned_to:    assigned || null,
        clear_assigned_to: !assigned,
        estimated_cost: costVal ? parseFloat(costVal) : null,
        clear_estimated_cost: !costVal && task.estimated_cost != null,
        notes: ov.querySelector('#tm-notes').value.trim() || null,
      });
      _projRenderDetail(el);
    }, 'Save');
  initSmartDates(overlay);
  openModal(overlay);
}

