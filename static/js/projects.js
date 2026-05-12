// ── Projects module ───────────────────────────────────────────────────────────

let _projects        = [];
let _projectDetail   = null;
let _projCustomTemplates = [];
let _projDetailEl    = null;   // cached container for FAB refresh
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
    filterLead: '1year', filterLength: 'any', filterDestination: 'any', filterTripType: 'any',
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
      { title: 'Check passport expiry — renew if needed',    milestone: 1, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -300, dest: 'international' },
      { title: 'Research visa requirements',                 milestone: 1, priority: 'high',   task_type: 'research', ref: 'deadline', offset: -280, dest: 'international' },
      { title: 'Apply for visas',                            milestone: 1, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -240, dest: 'international' },
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
    filterLead: '6month', filterLength: 'any', filterDestination: 'any', filterTripType: 'any',
    milestones: [
      { title: 'Research & Documentation', ref: 'deadline', offset: -175, is_deliverable: false },
      { title: 'Bookings Complete',        ref: 'deadline', offset: -120, is_deliverable: false },
      { title: 'Logistics & Activities',   ref: 'deadline', offset: -30,  is_deliverable: false },
      { title: 'Final Prep',              ref: 'deadline', offset: -7,   is_deliverable: false },
      { title: 'Packed & Ready',           ref: 'deadline', offset: -1,   is_deliverable: true  },
    ],
    tasks: [
      { title: 'Research destinations and set budget',  milestone: 0, priority: 'high',   task_type: 'research', ref: 'deadline', offset: -170 },
      { title: 'Check passport expiry — renew if needed', milestone: 0, priority: 'high', task_type: 'todo',     ref: 'deadline', offset: -165, dest: 'international' },
      { title: 'Research and apply for visas',          milestone: 0, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -150, dest: 'international' },
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
    filterLead: '3month', filterLength: 'any', filterDestination: 'any', filterTripType: 'any',
    milestones: [
      { title: 'Research & Decisions',  ref: 'deadline', offset: -90, is_deliverable: false },
      { title: 'Bookings Complete',     ref: 'deadline', offset: -60, is_deliverable: false },
      { title: 'Logistics Confirmed',   ref: 'deadline', offset: -21, is_deliverable: false },
      { title: 'Packed & Ready',        ref: 'deadline', offset: -1,  is_deliverable: true  },
    ],
    tasks: [
      { title: 'Define trip dates and budget',              milestone: 0, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -90 },
      { title: 'Research destinations and activities',      milestone: 0, priority: 'medium', task_type: 'research', ref: 'deadline', offset: -85 },
      { title: 'Check passport / visa requirements',        milestone: 0, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -80, dest: 'international' },
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
    filterLead: '1month', filterLength: 'any', filterDestination: 'any', filterTripType: 'any',
    milestones: [
      { title: 'Book Immediately',    ref: 'deadline', offset: -28, is_deliverable: false },
      { title: 'Pre-Trip Logistics',  ref: 'deadline', offset: -7,  is_deliverable: false },
      { title: 'Packed & Ready',      ref: 'deadline', offset: -1,  is_deliverable: true  },
    ],
    tasks: [
      { title: 'Book flights (if not already done)',           milestone: 0, priority: 'high',   task_type: 'purchase', ref: 'deadline', offset: -28 },
      { title: 'Book accommodations (if not already done)',    milestone: 0, priority: 'high',   task_type: 'purchase', ref: 'deadline', offset: -25 },
      { title: 'Purchase travel insurance',                    milestone: 0, priority: 'high',   task_type: 'purchase', ref: 'deadline', offset: -20 },
      { title: 'Check passport / visa requirements',           milestone: 0, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -20, dest: 'international' },
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
    filterLead: '1month', filterLength: 'weekend', filterDestination: 'domestic', filterTripType: ['general', 'roadtrip'],
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
      { title: 'Check weather forecast',                  milestone: 1, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -2  },
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
    filterLead: '6month', filterLength: 'any', filterDestination: 'international', filterTripType: 'any',
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
      { title: 'Apply for visa / travel authorization if required',  milestone: 0, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -100 },
      { title: 'Register travel with home country embassy if recommended', milestone: 0, priority: 'medium', task_type: 'todo', ref: 'deadline', offset: -90 },
      { title: 'Book flights',                                     milestone: 1, priority: 'high',   task_type: 'purchase', ref: 'deadline', offset: -90  },
      { title: 'Book accommodations',                              milestone: 1, priority: 'high',   task_type: 'purchase', ref: 'deadline', offset: -75  },
      { title: 'Purchase travel insurance',                        milestone: 1, priority: 'high',   task_type: 'purchase', ref: 'deadline', offset: -60  },
      { title: 'Book airport transfers if needed',                 milestone: 1, priority: 'medium', task_type: 'purchase', ref: 'deadline', offset: -45  },
      { title: 'Notify bank — get a travel card or local currency',milestone: 2, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -45  },
      { title: 'Check health requirements (vaccines, pills)',      milestone: 2, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -45  },
      { title: 'Get travel vaccinations if required',              milestone: 2, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -30  },
      { title: 'Plan detailed itinerary',                          milestone: 2, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -30  },
      { title: 'Reserve key activities and tours',                 milestone: 2, priority: 'medium', task_type: 'purchase', ref: 'deadline', offset: -21  },
      { title: 'Set up international phone plan or eSIM',          milestone: 3, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -14  },
      { title: 'Save / download all booking confirmations',        milestone: 3, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -7   },
      { title: 'Pack bags',                                        milestone: 4, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -2   },
      { title: 'Check in online if flying',                        milestone: 4, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -1   },
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
    filterLead: '3month', filterLength: 'any', filterDestination: 'any', filterTripType: 'sightseeing',
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
      { title: 'Book flights if flying and accommodation',         milestone: 0, priority: 'high',   task_type: 'purchase', ref: 'deadline', offset: -45 },
      { title: 'Buy museum / attraction passes',                  milestone: 1, priority: 'high',   task_type: 'purchase', ref: 'deadline', offset: -30 },
      { title: 'Book guided tours or experiences',                milestone: 1, priority: 'medium', task_type: 'purchase', ref: 'deadline', offset: -21 },
      { title: 'Reserve restaurants near key attractions',        milestone: 1, priority: 'low',    task_type: 'purchase', ref: 'deadline', offset: -14 },
      { title: 'Plan day-by-day itinerary',                       milestone: 2, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -7  },
      { title: 'Download city maps and transit apps offline',     milestone: 2, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -5  },
      { title: 'Check weather forecast',                          milestone: 2, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -5  },
      { title: 'Save / download tour and attraction confirmations', milestone: 2, priority: 'medium', task_type: 'todo',   ref: 'deadline', offset: -3  },
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
    filterLead: '3month', filterLength: 'any', filterDestination: 'any', filterTripType: 'beach',
    milestones: [
      { title: 'Choose & Book',       ref: 'deadline', offset: -45, is_deliverable: false },
      { title: 'Logistics & Add-ons', ref: 'deadline', offset: -7,  is_deliverable: false },
      { title: 'Ready to Unwind',     ref: 'deadline', offset: -1,  is_deliverable: true  },
    ],
    tasks: [
      { title: 'Research resorts / rental properties',          milestone: 0, priority: 'high',   task_type: 'research', ref: 'deadline', offset: -45 },
      { title: 'Book accommodation',                            milestone: 0, priority: 'high',   task_type: 'purchase', ref: 'deadline', offset: -40 },
      { title: 'Book flights if flying',                        milestone: 0, priority: 'high',   task_type: 'purchase', ref: 'deadline', offset: -35 },
      { title: 'Purchase travel insurance',                     milestone: 0, priority: 'medium', task_type: 'purchase', ref: 'deadline', offset: -30 },
      { title: 'Book spa or wellness treatments if desired',    milestone: 1, priority: 'medium', task_type: 'purchase', ref: 'deadline', offset: -14 },
      { title: 'Arrange beach / water activity rentals if desired', milestone: 1, priority: 'low', task_type: 'purchase', ref: 'deadline', offset: -10 },
      { title: 'Notify bank if travelling internationally',     milestone: 1, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -7  },
      { title: 'Check weather forecast',                        milestone: 1, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -5  },
      { title: 'Set out-of-office and disconnect from work',    milestone: 1, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -3  },
      { title: 'Pack light — beach essentials only',            milestone: 2, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -1  },
    ],
    note: { title: 'Relaxation Trip Notes', content: '<h2>Resort Details</h2><p><br></p><h2>Planned Activities</h2><p><br></p><h2>What to Pack</h2><p><br></p>' },
  },
  {
    id: 'trip_family',
    name: 'Family Trip',
    icon: '👨‍👩‍👧‍👦',
    description: 'Travel with children — kid-friendly destinations, activities for all ages, and family logistics',
    color: 'amber',
    tripVariant: true,
    leadLabel: 'Family',
    leadDays: 60,
    filterLead: '3month', filterLength: 'any', filterDestination: 'any', filterTripType: 'family',
    milestones: [
      { title: 'Research & Book',  ref: 'deadline', offset: -60, is_deliverable: false },
      { title: 'Pack & Prep',      ref: 'deadline', offset: -7,  is_deliverable: false },
      { title: 'Packed & Ready',   ref: 'deadline', offset: -1,  is_deliverable: true  },
    ],
    tasks: [
      { title: 'Research kid-friendly destinations and activities',      milestone: 0, priority: 'high',   task_type: 'research', ref: 'deadline', offset: -60 },
      { title: 'Book accommodation — confirm family rooms or cribs available', milestone: 0, priority: 'high', task_type: 'purchase', ref: 'deadline', offset: -55 },
      { title: 'Book flights if flying — check child fare and seat rules', milestone: 0, priority: 'high',  task_type: 'purchase', ref: 'deadline', offset: -50 },
      { title: 'Purchase travel insurance',                              milestone: 0, priority: 'medium', task_type: 'purchase', ref: 'deadline', offset: -45 },
      { title: 'Plan activities and downtime suitable for all ages',     milestone: 0, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -30 },
      { title: 'Reserve family-friendly restaurants',                    milestone: 0, priority: 'low',    task_type: 'purchase', ref: 'deadline', offset: -21 },
      { title: 'Pack medications, first aid, and child health supplies', milestone: 1, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -7  },
      { title: 'Arrange travel entertainment for kids',                  milestone: 1, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -5  },
      { title: 'Notify bank if travelling internationally',              milestone: 1, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -5  },
      { title: 'Save / download all booking confirmations',              milestone: 1, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -3  },
      { title: 'Pack bags — check car seats and strollers if needed',   milestone: 2, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -1  },
      { title: 'Check in online if flying',                              milestone: 2, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -1  },
    ],
    note: { title: 'Family Trip Notes', content: '<h2>Destination Ideas</h2><p><br></p><h2>Activity Plan</h2><p><br></p><h2>Packing List</h2><p><br></p><h2>What Kids Need</h2><p><br></p>' },
  },
  {
    id: 'trip_roadtrip',
    name: 'Road Trip',
    icon: '🚙',
    description: 'Drive-based adventure: route planning, overnight stops, and vehicle prep',
    color: 'green',
    tripVariant: true,
    leadLabel: 'Road Trip',
    leadDays: 21,
    filterLead: '1month', filterLength: 'any', filterDestination: 'domestic', filterTripType: 'roadtrip',
    milestones: [
      { title: 'Plan Route & Book Stops', ref: 'deadline', offset: -21, is_deliverable: false },
      { title: 'Vehicle & Packing Prep',  ref: 'deadline', offset: -3,  is_deliverable: false },
      { title: 'Ready to Roll',           ref: 'deadline', offset: -1,  is_deliverable: true  },
    ],
    tasks: [
      { title: 'Choose route and key destinations',           milestone: 0, priority: 'high',   task_type: 'research', ref: 'deadline', offset: -21 },
      { title: 'Book overnight stops and accommodation',      milestone: 0, priority: 'high',   task_type: 'purchase', ref: 'deadline', offset: -18 },
      { title: 'Research points of interest along the route', milestone: 0, priority: 'medium', task_type: 'research', ref: 'deadline', offset: -14 },
      { title: 'Download offline maps for the route',         milestone: 0, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -7  },
      { title: 'Book restaurant reservations at key stops',   milestone: 0, priority: 'low',    task_type: 'purchase', ref: 'deadline', offset: -7  },
      { title: 'Check vehicle — tyres, oil, fluids, wipers',  milestone: 1, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -3  },
      { title: 'Check weather forecast for the route',        milestone: 1, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -3  },
      { title: 'Pack roadside emergency kit',                 milestone: 1, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -2  },
      { title: 'Save / download accommodation confirmations', milestone: 1, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -2  },
      { title: 'Pack bags and load the car',                  milestone: 2, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -1  },
    ],
    note: { title: 'Road Trip Notes', content: '<h2>Route Plan</h2><p><br></p><h2>Overnight Stops</h2><p><br></p><h2>Points of Interest</h2><p><br></p><h2>Packing List</h2><p><br></p>' },
  },
  {
    id: 'trip_business',
    name: 'Business Trip',
    icon: '💼',
    description: 'Work travel: meetings, presentations, expense tracking, and professional prep',
    color: 'blue',
    tripVariant: true,
    leadLabel: 'Business',
    leadDays: 21,
    filterLead: '1month', filterLength: 'any', filterDestination: 'any', filterTripType: 'business',
    milestones: [
      { title: 'Book & Confirm Travel', ref: 'deadline', offset: -21, is_deliverable: false },
      { title: 'Prepare Materials',     ref: 'deadline', offset: -3,  is_deliverable: false },
      { title: 'Ready for Departure',   ref: 'deadline', offset: -1,  is_deliverable: true  },
    ],
    tasks: [
      { title: 'Confirm meeting schedule and agenda',              milestone: 0, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -21 },
      { title: 'Check company travel policy and expense requirements', milestone: 0, priority: 'medium', task_type: 'todo', ref: 'deadline', offset: -21 },
      { title: 'Book flights if flying',                            milestone: 0, priority: 'high',   task_type: 'purchase', ref: 'deadline', offset: -21 },
      { title: 'Book hotel near venue',                             milestone: 0, priority: 'high',   task_type: 'purchase', ref: 'deadline', offset: -18 },
      { title: 'Arrange ground transport / airport transfer if needed', milestone: 0, priority: 'medium', task_type: 'purchase', ref: 'deadline', offset: -14 },
      { title: 'Prepare presentation and materials',                milestone: 1, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -3  },
      { title: 'Pack business attire — confirm dress code requirements', milestone: 1, priority: 'high', task_type: 'todo', ref: 'deadline', offset: -2  },
      { title: 'Charge devices and set up VPN / adapters',          milestone: 1, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -1  },
      { title: 'Save / download hotel and flight confirmations',    milestone: 1, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -1  },
      { title: 'Set up expense tracking and receipts system',       milestone: 1, priority: 'low',    task_type: 'todo',     ref: 'deadline', offset: -1  },
      { title: 'Check in online if flying',                         milestone: 2, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -1  },
    ],
    note: { title: 'Business Trip Notes', content: '<h2>Meeting Schedule</h2><p><br></p><h2>Key Contacts</h2><p><br></p><h2>Expenses</h2><p><br></p><h2>Notes</h2><p><br></p>' },
  },
  {
    id: 'trip_cruise',
    name: 'Cruise',
    icon: '🚢',
    description: 'Port logistics, shore excursions, onboard prep, and embarkation planning',
    color: 'blue',
    tripVariant: true,
    leadLabel: 'Cruise',
    leadDays: 90,
    filterLead: '3month', filterLength: 'any', filterDestination: 'any', filterTripType: 'cruise',
    milestones: [
      { title: 'Book & Documents',     ref: 'deadline', offset: -90, is_deliverable: false },
      { title: 'Pre-Cruise Logistics', ref: 'deadline', offset: -30, is_deliverable: false },
      { title: 'Shore Excursions',     ref: 'deadline', offset: -14, is_deliverable: false },
      { title: 'Packed & Ready',       ref: 'deadline', offset: -1,  is_deliverable: true  },
    ],
    tasks: [
      { title: 'Book cruise and cabin category',                   milestone: 0, priority: 'high',   task_type: 'purchase', ref: 'deadline', offset: -90 },
      { title: 'Check passport — 6+ months validity; research visa requirements', milestone: 0, priority: 'high', task_type: 'todo', ref: 'deadline', offset: -85 },
      { title: 'Purchase travel insurance',                        milestone: 0, priority: 'high',   task_type: 'purchase', ref: 'deadline', offset: -80 },
      { title: 'Complete online check-in with cruise line',        milestone: 1, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -30 },
      { title: 'Book flights if flying to embarkation port',       milestone: 1, priority: 'high',   task_type: 'purchase', ref: 'deadline', offset: -30 },
      { title: 'Arrange pre/post-cruise accommodation if needed',  milestone: 1, priority: 'medium', task_type: 'purchase', ref: 'deadline', offset: -25 },
      { title: 'Notify bank if travelling internationally',        milestone: 1, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -21 },
      { title: 'Book shore excursions for key ports',              milestone: 2, priority: 'medium', task_type: 'purchase', ref: 'deadline', offset: -14 },
      { title: 'Confirm specialty dining reservations',            milestone: 2, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -10 },
      { title: 'Research onboard activities and spa packages',     milestone: 2, priority: 'low',    task_type: 'research', ref: 'deadline', offset: -7  },
      { title: 'Pack bags — check cruise dress code requirements', milestone: 3, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -2  },
      { title: 'Save / download boarding passes and cruise documents', milestone: 3, priority: 'high', task_type: 'todo',  ref: 'deadline', offset: -1  },
    ],
    note: { title: 'Cruise Notes', content: '<h2>Booking Confirmations</h2><p><br></p><h2>Port Itinerary</h2><p><br></p><h2>Shore Excursions</h2><p><br></p><h2>Budget</h2><p><br></p>' },
  },
  {
    id: 'trip_event',
    name: 'Event / Conference',
    icon: '🎟️',
    description: 'Travel for a specific event: wedding, conference, concert, or ceremony',
    color: 'amber',
    tripVariant: true,
    leadLabel: 'Event',
    leadDays: 30,
    filterLead: '1month', filterLength: 'any', filterDestination: 'any', filterTripType: 'event',
    milestones: [
      { title: 'Register & Book Travel', ref: 'deadline', offset: -30, is_deliverable: false },
      { title: 'Prepare & Pack',         ref: 'deadline', offset: -3,  is_deliverable: false },
      { title: 'Ready to Go',            ref: 'deadline', offset: -1,  is_deliverable: true  },
    ],
    tasks: [
      { title: 'Register for event / confirm invitation',        milestone: 0, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -30 },
      { title: 'Request time off work if needed',               milestone: 0, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -30 },
      { title: 'Book flights if flying or arrange transport',   milestone: 0, priority: 'high',   task_type: 'purchase', ref: 'deadline', offset: -28 },
      { title: 'Book accommodation near venue',                 milestone: 0, priority: 'high',   task_type: 'purchase', ref: 'deadline', offset: -25 },
      { title: 'Confirm schedule and venue details',            milestone: 0, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -14 },
      { title: 'Plan outfit or formal attire',                  milestone: 1, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -7  },
      { title: 'Arrange gift or card if applicable',            milestone: 1, priority: 'low',    task_type: 'todo',     ref: 'deadline', offset: -5  },
      { title: 'Save / download travel and event confirmations',milestone: 1, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -2  },
      { title: 'Pack bags',                                     milestone: 1, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -1  },
      { title: 'Check in online if flying',                     milestone: 2, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -1  },
    ],
    note: { title: 'Event Notes', content: '<h2>Event Details</h2><p><br></p><h2>Travel Bookings</h2><p><br></p><h2>What to Bring</h2><p><br></p>' },
  },
  {
    id: 'trip_camping',
    name: 'Camping Trip',
    icon: '🏕️',
    description: 'Campsite stays with overnight setup, cooking outdoors, and wilderness prep',
    color: 'green',
    tripVariant: true,
    leadLabel: 'Camping',
    leadDays: 30,
    filterLead: '1month', filterLength: 'any', filterDestination: 'any', filterTripType: 'camping',
    milestones: [
      { title: 'Plan & Book',    ref: 'deadline', offset: -30, is_deliverable: false },
      { title: 'Gear & Prep',    ref: 'deadline', offset: -7,  is_deliverable: false },
      { title: 'Packed & Ready', ref: 'deadline', offset: -1,  is_deliverable: true  },
    ],
    tasks: [
      { title: 'Choose campsite and confirm trip dates',               milestone: 0, priority: 'high',   task_type: 'research', ref: 'deadline', offset: -30 },
      { title: 'Book campsite reservation',                            milestone: 0, priority: 'high',   task_type: 'purchase', ref: 'deadline', offset: -28 },
      { title: 'Obtain permits or passes if required',                 milestone: 0, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -21 },
      { title: 'Research campground rules, amenities, and facilities', milestone: 0, priority: 'medium', task_type: 'research', ref: 'deadline', offset: -14 },
      { title: 'Plan route and arrival timing',                        milestone: 0, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -14 },
      { title: 'Check weather and fire / burn restrictions',           milestone: 1, priority: 'high',   task_type: 'research', ref: 'deadline', offset: -7  },
      { title: 'Plan meals and pack food and cooking supplies',        milestone: 1, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -7  },
      { title: 'Check and service all camping gear',                   milestone: 1, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -7  },
      { title: 'Download offline campground and area maps',            milestone: 1, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -5  },
      { title: 'Pack water and food storage — bear canister if required', milestone: 1, priority: 'high', task_type: 'todo',   ref: 'deadline', offset: -3  },
      { title: 'Pack waste kit and plan Leave No Trace',               milestone: 1, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -2  },
      { title: 'Pack first aid and safety kit',                        milestone: 1, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -2  },
      { title: 'Notify someone of your itinerary and return time',     milestone: 2, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -1  },
      { title: 'Final pack and load the car',                          milestone: 2, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -1  },
    ],
    note: { title: 'Camping Notes', content: '<h2>Campsite Info</h2><p><br></p><h2>Gear List</h2><p><br></p><h2>Meal Plan</h2><p><br></p><h2>Emergency Plan</h2><p><br></p>' },
  },
  {
    id: 'trip_hiking',
    name: 'Hiking & Outdoors',
    icon: '🥾',
    description: 'Day hikes, multi-day backpacking, and trail-focused outdoor trips',
    color: 'green',
    tripVariant: true,
    leadLabel: 'Hiking',
    leadDays: 21,
    filterLead: '1month', filterLength: 'any', filterDestination: 'any', filterTripType: 'hiking',
    milestones: [
      { title: 'Research & Plan',     ref: 'deadline', offset: -21, is_deliverable: false },
      { title: 'Gear & Prep',         ref: 'deadline', offset: -7,  is_deliverable: false },
      { title: 'Ready to Head Out',   ref: 'deadline', offset: -1,  is_deliverable: true  },
    ],
    tasks: [
      { title: 'Choose trail and research difficulty and distance',      milestone: 0, priority: 'high',   task_type: 'research', ref: 'deadline', offset: -21 },
      { title: 'Book campsite or obtain trailhead permits if required',  milestone: 0, priority: 'high',   task_type: 'purchase', ref: 'deadline', offset: -14 },
      { title: 'Download offline trail maps',                            milestone: 0, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -14 },
      { title: 'Plan route and identify turnaround / bail-out points',   milestone: 1, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -7  },
      { title: 'Check weather and trail conditions',                     milestone: 1, priority: 'high',   task_type: 'research', ref: 'deadline', offset: -7  },
      { title: 'Check and service all hiking gear',                      milestone: 1, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -7  },
      { title: 'Pack first aid and blister / emergency kit',             milestone: 1, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -3  },
      { title: 'Plan food and water carry — filter or purification tabs',milestone: 1, priority: 'medium', task_type: 'todo',     ref: 'deadline', offset: -2  },
      { title: 'Pack layers — base, mid, waterproof shell',              milestone: 2, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -1  },
      { title: 'Notify someone of your route and expected return',       milestone: 2, priority: 'high',   task_type: 'todo',     ref: 'deadline', offset: -1  },
    ],
    note: { title: 'Hiking Notes', content: '<h2>Trail Info</h2><p><br></p><h2>Gear List</h2><p><br></p><h2>Emergency Plan</h2><p><br></p>' },
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

function _normalizeProjCustomTemplate(t) {
  const milestones = typeof t.milestones === 'string' ? JSON.parse(t.milestones || '[]') : (t.milestones || []);
  const tasks      = typeof t.tasks      === 'string' ? JSON.parse(t.tasks      || '[]') : (t.tasks      || []);
  const note       = (t.note_title || t.note_content)
    ? { title: t.note_title || '', content: t.note_content || '' }
    : null;
  return { ...t, milestones, tasks, note, _isCustom: true };
}

const _TMPL_TYPE_MAP  = { beach:'Beach',camping:'Camping',hiking:'Hiking',sightseeing:'Sightseeing',
                           business:'Business',general:'General',roadtrip:'Road Trip',event:'Event',
                           family:'Family',cruise:'Cruise' };
const _TMPL_DEST_MAP  = { domestic:'Domestic',international:'International' };
const _TMPL_LEN_MAP   = { weekend:'Weekend',short:'Short',weeklong:'1 Week',extended:'Extended' };

function _projFilterBadgesHTML(tripType, dest, len) {
  const t = Array.isArray(tripType) ? tripType[0] : tripType;
  const parts = [];
  if (t   && t   !== 'any') parts.push(_TMPL_TYPE_MAP[t]   || t);
  if (dest && dest !== 'any') parts.push(_TMPL_DEST_MAP[dest] || dest);
  if (len  && len  !== 'any') parts.push(_TMPL_LEN_MAP[len]   || len);
  return parts.map(p => `<span class="pktmpl-filter-badge">${escHtml(p)}</span>`).join('');
}

async function _projLoadCustomTemplates() {
  try {
    const data = await apiFetch('GET', '/projects/templates');
    _projCustomTemplates = (data.items || []).map(_normalizeProjCustomTemplate);
  } catch(e) { _projCustomTemplates = []; }
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
      <button class="btn btn-secondary" id="proj-manage-templates-btn">Manage Templates</button>
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

  el.querySelector('#proj-manage-templates-btn').addEventListener('click', () => _projOpenManageTemplatesModal(el));
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
    _projDetailEl  = el;
    _projectDetail = await apiFetch('GET', `/projects/${projectId}`);
    window.setFabContext({
      projectId:         _projectDetail.id,
      projectName:       _projectDetail.title,
      projectTripId:     _projectDetail.trip_id || null,
      projectMilestones: (_projectDetail.milestones || [])
        .filter(m => m.status !== 'completed')
        .map(m => ({ id: m.id, title: m.title })),
      _onAdded: _projFabRefresh,
    });
    _projRenderDetail(el);
  } catch(e) {
    el.innerHTML = `<div class="empty-state"><p class="empty-state-text">Failed to load project.</p></div>`;
  }
}

async function _projFabRefresh() {
  if (!_projectDetail || !_projDetailEl) return;
  try {
    _projectDetail = await apiFetch('GET', `/projects/${_projectDetail.id}`);
    window.setFabContext({
      projectMilestones: (_projectDetail.milestones || [])
        .filter(m => m.status !== 'completed')
        .map(m => ({ id: m.id, title: m.title })),
    });
    _projRenderDetail(_projDetailEl);
  } catch(e) { /* non-fatal */ }
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
      <div style="display:flex;align-items:center;gap:10px">
        <button class="proj-back-btn" id="proj-back">← Projects</button>
        ${p.trip_id ? `<button class="proj-back-btn" id="proj-trip-link" style="opacity:0.75">✈ ${escHtml(p.trip_name || 'Trip')}</button>` : ''}
      </div>
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
  el.querySelector('#proj-trip-link')?.addEventListener('click', () => {
    window._openTripId = p.trip_id;
    loadPage('trips');
  }, sig);
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
  let selectedIsCustom = false;

  function buildPickerHTML() {
    const defaultTmpls = PROJ_TEMPLATES.filter(t => !t.tripVariant);
    const customSection = _projCustomTemplates.length ? `
      <div class="proj-tmpl-section-hdr">My Templates</div>
      <div class="proj-tmpl-grid" style="margin-bottom:16px">
        ${_projCustomTemplates.map(t => `
          <div class="proj-tmpl-card" data-tmpl="${t.id}" data-custom="1">
            <div class="proj-tmpl-top">
              <span class="proj-tmpl-icon">${escHtml(t.icon || '📋')}</span>
              <div>
                <div class="proj-tmpl-name">${escHtml(t.name)}</div>
                <div class="proj-tmpl-desc">${escHtml(t.description || '')}</div>
              </div>
            </div>
            <div class="proj-tmpl-ms-list">
              ${(t.milestones || []).map(m => `<span class="proj-tmpl-ms-item">● ${escHtml(m.title)}</span>`).join('')}
            </div>
            <span class="proj-tmgr-badge proj-tmgr-badge--custom" style="margin-top:6px;display:inline-flex">✎ Custom</span>
          </div>`).join('')}
      </div>` : '';
    const builtinSection = `
      <div class="proj-tmpl-section-hdr">Built-in Templates</div>
      <div class="proj-tmpl-grid">
        ${defaultTmpls.map(t => `
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
          </div>`).join('')}
      </div>`;
    return customSection + builtinSection;
  }

  const overlay = createModal('Start from a Template',
    `<div id="proj-tpick-body">${buildPickerHTML()}</div>
     <p style="text-align:center;margin-top:12px;font-size:12px;color:var(--text-muted)">Relative due dates are resolved from your project's start date and deadline.</p>`,
    ov => {
      if (!selectedId) { alert('Select a template to continue.'); return false; }
      const tmpl = selectedIsCustom
        ? _projCustomTemplates.find(t => t.id === parseInt(selectedId))
        : PROJ_TEMPLATES.find(t => t.id === selectedId);
      closeModal(ov);
      ov.remove();
      _projOpenNewModal(el, tmpl);
      return false;
    }, 'Use Template');

  const footer = overlay.querySelector('.modal-footer');
  const blankBtn = document.createElement('button');
  blankBtn.className = 'btn btn-secondary';
  blankBtn.textContent = 'Start blank';
  blankBtn.style.marginRight = 'auto';
  blankBtn.addEventListener('click', () => { closeModal(overlay); overlay.remove(); _projOpenNewModal(el); });
  footer.prepend(blankBtn);

  overlay.querySelector('#proj-tpick-body').addEventListener('click', e => {
    const card = e.target.closest('.proj-tmpl-card');
    if (!card) return;
    overlay.querySelectorAll('.proj-tmpl-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedId = card.dataset.tmpl;
    selectedIsCustom = !!card.dataset.custom;
  });

  openModal(overlay);

  _projLoadCustomTemplates().then(() => {
    if (_projCustomTemplates.length) {
      overlay.querySelector('#proj-tpick-body').innerHTML = buildPickerHTML();
      // re-select previous selection if still present
      if (selectedId) {
        const prev = overlay.querySelector(`.proj-tmpl-card[data-tmpl="${selectedId}"]`);
        if (prev) prev.classList.add('selected');
      }
    }
  });
}

async function _projOpenManageTemplatesModal(el) {
  await _projLoadCustomTemplates();
  const defaultTmpls = PROJ_TEMPLATES.filter(t => !t.tripVariant);

  function renderBody(ov) {
    const body = ov.querySelector('#tmgr-body');
    const defaultCards = defaultTmpls.map(t => {
      const badges = _projFilterBadgesHTML(t.filterTripType, t.filterDestination, t.filterLength);
      return `
      <div class="proj-tmgr-card proj-tmgr-card--default">
        <div class="proj-tmgr-card-top">
          <span class="proj-tmgr-card-icon">${t.icon}</span>
          <div>
            <div class="proj-tmgr-card-name">${escHtml(t.name)}</div>
            <div class="proj-tmgr-card-desc">${escHtml(t.description || '')}</div>
            ${badges ? `<div style="margin-top:4px">${badges}</div>` : ''}
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
          <span class="proj-tmgr-badge proj-tmgr-badge--builtin">🔒 Built-in</span>
          <button class="btn btn-secondary btn-sm tmgr-copy-btn" data-id="${t.id}">Make a copy</button>
        </div>
      </div>`;
    }).join('');

    const customCards = _projCustomTemplates.length
      ? _projCustomTemplates.map(t => {
          const srcName = t.source_id ? (PROJ_TEMPLATES.find(s => s.id === t.source_id)?.name || null) : null;
          const badges = _projFilterBadgesHTML(t.filter_trip_type, t.filter_destination, t.filter_length);
          return `
          <div class="proj-tmgr-card" data-id="${t.id}">
            <div class="proj-tmgr-card-top">
              <span class="proj-tmgr-card-icon">${escHtml(t.icon || '📋')}</span>
              <div>
                <div class="proj-tmgr-card-name">${escHtml(t.name)}</div>
                <div class="proj-tmgr-card-desc">${escHtml(t.description || '')}</div>
                ${srcName ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">Based on: ${escHtml(srcName)}</div>` : ''}
                ${badges ? `<div style="margin-top:4px">${badges}</div>` : ''}
              </div>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
              <span class="proj-tmgr-badge proj-tmgr-badge--custom">✎ Custom</span>
              <div style="display:flex;gap:4px">
                <button class="btn btn-secondary btn-sm tmgr-edit-btn" data-id="${t.id}">Edit</button>
                <button class="btn btn-icon tmgr-del-btn" data-id="${t.id}" title="Delete">✕</button>
              </div>
            </div>
          </div>`;
        }).join('')
      : `<p style="color:var(--text-muted);font-size:13px;padding:6px 0">No custom templates yet — make a copy of a built-in template or create one from scratch.</p>`;

    body.innerHTML = `
      <div class="proj-tmgr-section">
        <div class="proj-tmgr-section-hdr">
          <span class="proj-tmgr-section-title">Built-in Templates</span>
        </div>
        <div class="proj-tmgr-grid">${defaultCards}</div>
      </div>
      <div class="proj-tmgr-section">
        <div class="proj-tmgr-section-hdr">
          <span class="proj-tmgr-section-title">My Templates</span>
          <button class="btn btn-primary btn-sm" id="tmgr-new-btn">+ New Template</button>
        </div>
        <div class="proj-tmgr-custom-grid">${customCards}</div>
      </div>`;

    body.querySelector('#tmgr-new-btn').addEventListener('click', () => {
      _projOpenTemplateEditorModal({}, async () => {
        await _projLoadCustomTemplates();
        renderBody(ov);
      });
    });

    body.querySelectorAll('.tmgr-copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const src = defaultTmpls.find(t => t.id === btn.dataset.id);
        if (!src) return;
        const srcTripType = Array.isArray(src.filterTripType)
          ? (src.filterTripType[0] || 'any') : (src.filterTripType || 'any');
        _projOpenTemplateEditorModal({
          name: `${src.name} (copy)`,
          icon: src.icon,
          description: src.description || '',
          color: src.color || 'cyan',
          is_ongoing: !!src.is_ongoing,
          source_id: src.id,
          filter_trip_type:  srcTripType,
          filter_destination: src.filterDestination || 'any',
          filter_length:     src.filterLength || 'any',
          milestones: JSON.parse(JSON.stringify(src.milestones || [])),
          tasks: JSON.parse(JSON.stringify(src.tasks || [])),
          note_title: src.note?.title || '',
          note_content: src.note?.content || '',
        }, async () => {
          await _projLoadCustomTemplates();
          renderBody(ov);
        });
      });
    });

    body.querySelectorAll('.tmgr-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tmpl = _projCustomTemplates.find(t => t.id === parseInt(btn.dataset.id));
        if (!tmpl) return;
        _projOpenTemplateEditorModal({
          id: tmpl.id,
          name: tmpl.name,
          icon: tmpl.icon || '📋',
          description: tmpl.description || '',
          color: tmpl.color || 'cyan',
          is_ongoing: !!tmpl.is_ongoing,
          source_id: tmpl.source_id || null,
          filter_trip_type:  tmpl.filter_trip_type  || 'any',
          filter_destination: tmpl.filter_destination || 'any',
          filter_length:     tmpl.filter_length     || 'any',
          milestones: JSON.parse(JSON.stringify(tmpl.milestones || [])),
          tasks: JSON.parse(JSON.stringify(tmpl.tasks || [])),
          note_title: tmpl.note?.title || '',
          note_content: tmpl.note?.content || '',
        }, async () => {
          await _projLoadCustomTemplates();
          renderBody(ov);
        });
      });
    });

    body.querySelectorAll('.tmgr-del-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const tmpl = _projCustomTemplates.find(t => t.id === parseInt(btn.dataset.id));
        if (!tmpl || !confirm(`Delete template "${tmpl.name}"?`)) return;
        try {
          await apiFetch('DELETE', `/projects/templates/${tmpl.id}`);
          await _projLoadCustomTemplates();
          renderBody(ov);
        } catch(e) { alert(e.message); }
      });
    });
  }

  const overlay = createModal('Manage Project Templates',
    '<div id="tmgr-body" style="min-height:160px"></div>',
    () => {}, 'Done'
  );
  overlay.querySelector('.modal').style.maxWidth = '800px';
  overlay.querySelector('.modal-cancel-btn').remove();
  renderBody(overlay);
  openModal(overlay);
}

function _projOpenTemplateEditorModal(initData, onSave) {
  const isEdit = !!initData.id;
  const state = {
    name:              initData.name             || '',
    icon:              initData.icon             || '📋',
    description:       initData.description      || '',
    color:             initData.color            || 'cyan',
    is_ongoing:        !!initData.is_ongoing,
    source_id:         initData.source_id        || null,
    filter_trip_type:  initData.filter_trip_type  || 'any',
    filter_destination:initData.filter_destination|| 'any',
    filter_length:     initData.filter_length     || 'any',
    milestones:        (initData.milestones || []).map(m => ({ ...m })),
    tasks:             (initData.tasks      || []).map(t => ({ ...t })),
    note_title:        initData.note_title        || '',
    note_content:      initData.note_content      || '',
  };

  function syncFromModal(ov) {
    state.name              = ov.querySelector('#te-name').value.trim();
    state.icon              = ov.querySelector('#te-icon').value.trim() || '📋';
    state.description       = ov.querySelector('#te-desc').value.trim();
    state.color             = ov.querySelector('.proj-color-swatch.active')?.dataset.color || state.color;
    state.is_ongoing        = ov.querySelector('#te-ongoing').checked;
    state.filter_trip_type  = ov.querySelector('#te-ftype').value;
    state.filter_destination= ov.querySelector('#te-fdest').value;
    state.filter_length     = ov.querySelector('#te-flength').value;
    state.note_title        = ov.querySelector('#te-note-title').value.trim();
    state.note_content      = ov.querySelector('#te-note-content').value.trim();
    state.milestones   = [...ov.querySelectorAll('.tmpl-ms-row')].map(row => ({
      title:          row.querySelector('.tmpl-ms-title').value,
      ref:            row.querySelector('.tmpl-ms-ref').value,
      offset:         parseInt(row.querySelector('.tmpl-ms-offset').value) || 0,
      is_deliverable: row.querySelector('.tmpl-ms-deliv').checked,
    }));
    state.tasks = [...ov.querySelectorAll('.tmpl-task-row')].map(row => {
      const msVal = row.querySelector('.tmpl-task-ms').value;
      return {
        title:     row.querySelector('.tmpl-task-title').value,
        milestone: msVal !== '' ? parseInt(msVal) : null,
        priority:  row.querySelector('.tmpl-task-priority').value,
        task_type: row.querySelector('.tmpl-task-type').value,
        ref:       row.querySelector('.tmpl-task-ref').value,
        offset:    parseInt(row.querySelector('.tmpl-task-offset').value) || 0,
      };
    });
  }

  function renderMilestones(ov) {
    ov.querySelector('#te-ms-tbody').innerHTML = state.milestones.map((m, i) => `
      <tr class="tmpl-ms-row" data-idx="${i}">
        <td><input class="tmpl-inp tmpl-ms-title" value="${escHtml(m.title)}" placeholder="Milestone name"></td>
        <td><select class="tmpl-inp tmpl-inp-sel tmpl-ms-ref">
          <option value="start"${m.ref==='start'?' selected':''}>Start</option>
          <option value="deadline"${m.ref==='deadline'?' selected':''}>Deadline</option>
        </select></td>
        <td><input class="tmpl-inp tmpl-inp-sm tmpl-ms-offset" type="number" value="${m.offset}"></td>
        <td style="text-align:center"><input type="checkbox" class="tmpl-ms-deliv"${m.is_deliverable?' checked':''}></td>
        <td><button type="button" class="tmpl-del-btn tmpl-ms-del">✕</button></td>
      </tr>`).join('');
    ov.querySelector('#te-ms-tbody').querySelectorAll('.tmpl-ms-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.closest('.tmpl-ms-row').dataset.idx);
        syncFromModal(ov);
        state.milestones.splice(idx, 1);
        state.tasks.forEach(t => {
          if (t.milestone === idx) t.milestone = null;
          else if (t.milestone != null && t.milestone > idx) t.milestone--;
        });
        renderMilestones(ov);
        renderTasks(ov);
      });
    });
  }

  function msOptions() {
    return state.milestones.map((m, i) =>
      `<option value="${i}">${escHtml(m.title || `Milestone ${i + 1}`)}</option>`
    ).join('');
  }

  function renderTasks(ov) {
    const opts = msOptions();
    ov.querySelector('#te-task-tbody').innerHTML = state.tasks.map((t, i) => `
      <tr class="tmpl-task-row" data-idx="${i}">
        <td><input class="tmpl-inp tmpl-task-title" value="${escHtml(t.title)}" placeholder="Task name" style="min-width:130px"></td>
        <td><select class="tmpl-inp tmpl-inp-sel tmpl-task-ms" style="width:100px">
          <option value="">—</option>
          ${opts.replace(`value="${t.milestone}"`, `value="${t.milestone}" selected`)}
        </select></td>
        <td><select class="tmpl-inp tmpl-inp-sel tmpl-task-priority" style="width:72px">
          ${['high','medium','low'].map(p => `<option value="${p}"${t.priority===p?' selected':''}>${p}</option>`).join('')}
        </select></td>
        <td><select class="tmpl-inp tmpl-inp-sel tmpl-task-type" style="width:86px">
          ${['todo','research','purchase','event'].map(ty => `<option value="${ty}"${t.task_type===ty?' selected':''}>${ty}</option>`).join('')}
        </select></td>
        <td><select class="tmpl-inp tmpl-inp-sel tmpl-task-ref" style="width:76px">
          <option value="start"${t.ref==='start'?' selected':''}>Start</option>
          <option value="deadline"${t.ref==='deadline'?' selected':''}>Deadline</option>
        </select></td>
        <td><input class="tmpl-inp tmpl-inp-sm tmpl-task-offset" type="number" value="${t.offset}" style="width:58px"></td>
        <td><button type="button" class="tmpl-del-btn tmpl-task-del">✕</button></td>
      </tr>`).join('');
    ov.querySelector('#te-task-tbody').querySelectorAll('.tmpl-task-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.closest('.tmpl-task-row').dataset.idx);
        syncFromModal(ov);
        state.tasks.splice(idx, 1);
        renderTasks(ov);
      });
    });
  }

  const bodyHTML = `
    <div class="tmpl-ed-section">
      <div style="display:grid;grid-template-columns:1fr 64px 1fr;gap:12px;align-items:end;margin-bottom:12px">
        <div class="form-group" style="margin:0">
          <label class="form-label">Template name</label>
          <input class="form-input" id="te-name" value="${escHtml(state.name)}" placeholder="My Template">
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">Icon</label>
          <input class="form-input" id="te-icon" value="${escHtml(state.icon)}" style="text-align:center;font-size:17px;padding:5px 4px">
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">Color</label>
          <div class="proj-color-picker" id="te-color-picker">
            ${PROJ_COLORS.map(c => `<button type="button" class="proj-color-swatch${c===state.color?' active':''}" data-color="${c}" style="background:${PROJ_COLOR_HEX[c]}" title="${c}"></button>`).join('')}
          </div>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <input class="form-input" id="te-desc" value="${escHtml(state.description)}" placeholder="What is this template for?">
      </div>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;margin-bottom:4px">
        <input type="checkbox" id="te-ongoing"${state.is_ongoing?' checked':''}> Ongoing project (no fixed deadline)
      </label>
      ${state.source_id ? `<p class="tmpl-ed-hint" style="margin-top:8px">Based on: <strong>${escHtml(PROJ_TEMPLATES.find(t=>t.id===state.source_id)?.name || state.source_id)}</strong></p>` : ''}
    </div>

    <div class="tmpl-ed-section">
      <div class="tmpl-ed-section-hdr"><span>Trip Context <span style="font-weight:400;text-transform:none;letter-spacing:0;opacity:.6">(optional filters)</span></span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
        <div>
          <label class="form-label" style="font-size:11px">Trip type</label>
          <select class="form-input" id="te-ftype">
            ${[['any','Any'],['beach','Beach'],['camping','Camping'],['hiking','Hiking'],['sightseeing','Sightseeing'],
               ['business','Business'],['general','General'],['roadtrip','Road Trip'],['event','Event'],
               ['family','Family'],['cruise','Cruise']].map(([v,l])=>`<option value="${v}"${state.filter_trip_type===v?' selected':''}>${l}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="form-label" style="font-size:11px">Destination</label>
          <select class="form-input" id="te-fdest">
            ${[['any','Any'],['domestic','Domestic'],['international','International']].map(([v,l])=>`<option value="${v}"${state.filter_destination===v?' selected':''}>${l}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="form-label" style="font-size:11px">Trip length</label>
          <select class="form-input" id="te-flength">
            ${[['any','Any'],['weekend','Weekend'],['short','Short'],['weeklong','1 Week'],['extended','Extended']].map(([v,l])=>`<option value="${v}"${state.filter_length===v?' selected':''}>${l}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>

    <div class="tmpl-ed-section">
      <div class="tmpl-ed-section-hdr">
        <span>Milestones</span>
        <button type="button" class="btn btn-secondary btn-sm" id="te-add-ms">+ Add Milestone</button>
      </div>
      <table class="tmpl-ms-table">
        <thead><tr>
          <th>Title</th><th>Relative to</th><th>Days offset</th>
          <th title="Counts as a deliverable milestone">Deliv.</th><th></th>
        </tr></thead>
        <tbody id="te-ms-tbody"></tbody>
      </table>
      <p class="tmpl-ed-hint">Positive offset = after the reference date; negative = before.</p>
    </div>

    <div class="tmpl-ed-section">
      <div class="tmpl-ed-section-hdr">
        <span>Tasks</span>
        <button type="button" class="btn btn-secondary btn-sm" id="te-add-task">+ Add Task</button>
      </div>
      <table class="tmpl-task-table">
        <thead><tr>
          <th>Title</th><th>Milestone</th><th>Priority</th>
          <th>Type</th><th>Relative to</th><th>Offset</th><th></th>
        </tr></thead>
        <tbody id="te-task-tbody"></tbody>
      </table>
    </div>

    <div class="tmpl-ed-section">
      <div class="tmpl-ed-section-hdr"><span>Starter Note (optional)</span></div>
      <div class="form-group">
        <label class="form-label">Note title</label>
        <input class="form-input" id="te-note-title" value="${escHtml(state.note_title)}" placeholder="Project Log">
      </div>
      <div class="form-group">
        <label class="form-label">Note content (plain text)</label>
        <textarea class="form-input" id="te-note-content" rows="3" placeholder="Initial note content…">${escHtml(state.note_content)}</textarea>
      </div>
    </div>`;

  const overlay = createModal(
    isEdit ? 'Edit Template' : 'New Template',
    bodyHTML,
    async ov => {
      syncFromModal(ov);
      if (!state.name) { alert('Template name is required.'); return false; }
      const payload = {
        name:               state.name,
        icon:               state.icon,
        description:        state.description || null,
        color:              state.color,
        is_ongoing:         state.is_ongoing,
        source_id:          state.source_id   || null,
        filter_trip_type:   state.filter_trip_type,
        filter_destination: state.filter_destination,
        filter_length:      state.filter_length,
        milestones:         JSON.stringify(state.milestones),
        tasks:              JSON.stringify(state.tasks),
        note_title:         state.note_title   || null,
        note_content:       state.note_content || null,
      };
      try {
        if (isEdit) {
          await apiFetch('PATCH', `/projects/templates/${initData.id}`, payload);
        } else {
          await apiFetch('POST', '/projects/templates', payload);
        }
        if (onSave) onSave();
      } catch(e) { alert(e.message); return false; }
    },
    isEdit ? 'Save Changes' : 'Create Template'
  );

  overlay.querySelector('.modal').style.maxWidth = '740px';

  overlay.querySelectorAll('.proj-color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      overlay.querySelectorAll('.proj-color-swatch').forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
    });
  });

  overlay.querySelector('#te-add-ms').addEventListener('click', () => {
    syncFromModal(overlay);
    state.milestones.push({ title: '', ref: 'start', offset: 0, is_deliverable: false });
    renderMilestones(overlay);
    renderTasks(overlay);
  });

  overlay.querySelector('#te-add-task').addEventListener('click', () => {
    syncFromModal(overlay);
    state.tasks.push({ title: '', milestone: null, priority: 'medium', task_type: 'todo', ref: 'start', offset: 0 });
    renderTasks(overlay);
  });

  renderMilestones(overlay);
  renderTasks(overlay);
  openModal(overlay);
}

async function _projApplyTemplateToProject(proj, template, destFilter = 'any') {
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
    if (t.dest === 'international' && destFilter === 'domestic') continue;
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

