/**
 * Creative diversity layer.
 *
 * The story engine is deliberately deterministic, which is right for
 * reproducibility but wrong for creative variety: every campaign was filming
 * the same hallway, the same boxes and the same garage. This module sits in
 * FRONT of the story and the video prompt and chooses a genuinely different
 * creative treatment for each campaign, using the campaign history as memory so
 * a recently used treatment is not repeated.
 *
 * It is deterministic given the same inputs (same campaign, same history), so
 * nothing is random and nothing changes between a preview and a generation.
 * Crucially the choice happens BEFORE any paid generation request, so variety
 * never costs a second paid render.
 *
 * Pure module: no clock beyond what it is given, no network, no database.
 */

/** One coherent creative treatment: a whole film, not a bag of random knobs. */
export type CreativeTreatment = {
  id: string;
  name: string;
  /** Treatments in the same family look alike; two in a row is avoided. */
  family: "MOVE" | "LIFE_EVENT" | "SEASON" | "SPACE" | "BUSINESS" | "COMMUNITY";
  audience: "renters" | "hosts" | "both";
  hook: string;
  setting: string;
  cast: string;
  props: string;
  openingShot: string;
  cameraMovement: string;
  lighting: string;
  tone: string;
  pacing: string;
  transitions: string;
  metaphor: string;
  ending: string;
  ctaTreatment: string;
  /** Four beats: open, develop, turn, resolve. */
  beats: readonly { visual: string; caption: string }[];
};

/**
 * Twenty treatments. Each one is a different story, in a different place, with
 * different people, props, camera and light — not a re-dressed hallway.
 */
export const CREATIVE_TREATMENTS: readonly CreativeTreatment[] = [
  {
    id: "moving-house",
    name: "Moving-house story",
    family: "MOVE",
    audience: "renters",
    hook: "The van's booked. The new place isn't ready.",
    setting: "A terraced street on moving day, a hired van half loaded.",
    cast: "A couple in their thirties and a patient neighbour.",
    props: "Taped cartons, a mattress in a bag, a kettle nobody packed.",
    openingShot: "Low, wide shot along the pavement past the open van doors.",
    cameraMovement: "Slow dolly alongside the van, then locked-off interiors.",
    lighting: "Overcast British morning, soft and even.",
    tone: "Warm, slightly harried, ends calm.",
    pacing: "Brisk open, settling in the second half.",
    transitions: "Straight cuts on movement.",
    metaphor: "A gap between two homes.",
    ending: "The van drives off empty; the pavement is clear.",
    ctaTreatment: "Spoken over the empty pavement.",
    beats: [
      {
        visual: "A hired van outside a terraced house, doors open, rain just stopping.",
        caption: "Moving day",
      },
      {
        visual: "Boxes stacked on the pavement while a completion call goes unanswered.",
        caption: "The dates don't line up",
      },
      { visual: "A nearby garage door rolling up on a dry, swept bay.", caption: "Space nearby" },
      {
        visual: "The last box carried in; the two people shake hands at the door.",
        caption: "Sorted for now",
      },
    ],
  },
  {
    id: "renovation",
    name: "Renovation story",
    family: "SPACE",
    audience: "renters",
    hook: "You can't plaster a room around a sofa.",
    setting: "A 1930s semi mid-refurbishment, dust sheets everywhere.",
    cast: "A homeowner and a plasterer.",
    props: "Dust sheets, a mitre saw, a wrapped sofa, radiators off the wall.",
    openingShot: "Tight on a paint roller stopping short of a stacked bookcase.",
    cameraMovement: "Handheld, close, following hands rather than faces.",
    lighting: "Hard work-light against grey daylight.",
    tone: "Practical and dry.",
    pacing: "Steady, unhurried.",
    transitions: "Match cuts on the same corner of the room.",
    metaphor: "Clearing the floor to do the job properly.",
    ending: "The finished room, empty and light.",
    ctaTreatment: "On-screen only, over the finished room.",
    beats: [
      {
        visual:
          "A half-stripped living room where furniture is shoved into the middle under sheets.",
        caption: "Nowhere to work",
      },
      {
        visual: "A plasterer edging around a wrapped sofa, shaking his head.",
        caption: "The job takes twice as long",
      },
      {
        visual: "The same furniture, wrapped and stacked neatly in a dry lock-up two streets away.",
        caption: "Out of the way",
      },
      {
        visual: "The finished room: bare, bright, floor clear, ready to be lived in.",
        caption: "Done properly",
      },
    ],
  },
  {
    id: "new-baby",
    name: "Growing family",
    family: "LIFE_EVENT",
    audience: "renters",
    hook: "The nursery is currently the storage room.",
    setting: "A small flat's box room in late pregnancy.",
    cast: "Two expectant parents.",
    props: "A flat-packed cot, guitar cases, a filing box, a clothes rail.",
    openingShot: "Doorway shot of a room too full to enter.",
    cameraMovement: "One slow push through the doorway.",
    lighting: "Soft window light, warm lamps.",
    tone: "Tender and quiet.",
    pacing: "Slow throughout.",
    transitions: "Gentle dissolves.",
    metaphor: "Making room for someone new.",
    ending: "The same room with a cot and nothing else.",
    ctaTreatment: "Whispered voiceover over the finished nursery.",
    beats: [
      {
        visual: "A box room so full the door only opens halfway.",
        caption: "The room that has to change",
      },
      {
        visual: "Hands lifting an old amplifier and a rail of coats with nowhere to put them.",
        caption: "None of it can go",
      },
      {
        visual: "The same items on shelving in a clean, dry spare room elsewhere.",
        caption: "Kept, just not here",
      },
      { visual: "A cot against a fresh wall, everything else gone.", caption: "Ready" },
    ],
  },
  {
    id: "student",
    name: "Student summer",
    family: "SEASON",
    audience: "renters",
    hook: "Halls close in June. Home is four hours away.",
    setting: "A university hall corridor at the end of term.",
    cast: "Two students and a hall porter.",
    props: "A mini fridge, a bike, laundry bags, a desk lamp.",
    openingShot: "Corridor perspective, doors propped open, everyone leaving.",
    cameraMovement: "Steady tracking down the corridor.",
    lighting: "Bright summer light through a stairwell window.",
    tone: "Light and a bit comic.",
    pacing: "Fast.",
    transitions: "Whip cuts.",
    metaphor: "Term ends but your things don't.",
    ending: "A bike wheeled into a neighbour's garage.",
    ctaTreatment: "Fast on-screen line, no voiceover.",
    beats: [
      {
        visual:
          "A hall corridor on the last day of term: propped doors, bin bags, a mini fridge in the way.",
        caption: "Halls close",
      },
      {
        visual: "A boot that will not take a bike, a fridge and three laundry bags.",
        caption: "It doesn't all fit",
      },
      {
        visual: "A nearby garage taking the fridge and the bike, labelled and stacked.",
        caption: "Leave it locally",
      },
      { visual: "An empty room, keys handed to the porter.", caption: "Come back in September" },
    ],
  },
  {
    id: "seasonal",
    name: "Seasonal swap",
    family: "SEASON",
    audience: "renters",
    hook: "Half your house is asleep for six months of the year.",
    setting: "A garden shed and a hallway cupboard in October.",
    cast: "One person, methodical.",
    props: "Garden furniture, a parasol, a paddling pool, Christmas crates.",
    openingShot: "Overhead of stacked garden chairs under a wet cover.",
    cameraMovement: "Time-lapse-feel locked shots, no camera motion.",
    lighting: "Low autumn sun, long shadows.",
    tone: "Orderly and satisfying.",
    pacing: "Rhythmic.",
    transitions: "Hard cuts on identical framing.",
    metaphor: "Rotating a wardrobe, but for a house.",
    ending: "A clear shed with just tools in it.",
    ctaTreatment: "Quiet closing line.",
    beats: [
      {
        visual: "Garden furniture stacked under a soaked cover in October drizzle.",
        caption: "Out of season",
      },
      {
        visual: "A shed door that will not close behind a parasol and a paddling pool.",
        caption: "Six months in the way",
      },
      {
        visual: "The same furniture dry and stacked in a neighbour's outbuilding.",
        caption: "Somewhere dry, nearby",
      },
      {
        visual: "A tidy shed with a mower, a spade and floor to stand on.",
        caption: "Room to use it again",
      },
    ],
  },
  {
    id: "downsizing",
    name: "Downsizing",
    family: "LIFE_EVENT",
    audience: "renters",
    hook: "Forty years of a house into a two-bedroom flat.",
    setting: "A family home being emptied, room by room.",
    cast: "A retired couple and their adult daughter.",
    props: "A dining table, photograph albums, a china cabinet.",
    openingShot: "Wide of a dining room with half the furniture already gone.",
    cameraMovement: "Slow, static compositions; one gentle pan.",
    lighting: "Warm afternoon light through net curtains.",
    tone: "Respectful, unsentimental.",
    pacing: "Slow.",
    transitions: "Fades.",
    metaphor: "Deciding later, not deciding never.",
    ending: "A photograph album kept out on the new coffee table.",
    ctaTreatment: "Spoken, calm.",
    beats: [
      {
        visual: "A dining room half empty, a china cabinet still against the wall.",
        caption: "Time to move on",
      },
      {
        visual: "Two people looking at a table that will not fit in the new flat.",
        caption: "Some of it can't come",
      },
      {
        visual: "The table wrapped and stored in a dry local space, labelled clearly.",
        caption: "Not decided yet",
      },
      {
        visual: "A small flat, comfortable, one album out on the table.",
        caption: "Keep what matters",
      },
    ],
  },
  {
    id: "delayed-sale",
    name: "Delayed sale",
    family: "MOVE",
    audience: "renters",
    hook: "The chain broke on a Tuesday.",
    setting: "A hallway with a SOLD board outside, boxes already packed.",
    cast: "One person on the phone.",
    props: "An estate agent board, packed cartons, a suitcase.",
    openingShot: "Through the front-door glass onto the SOLD board.",
    cameraMovement: "One long, slow pull back down the hall.",
    lighting: "Flat interior light, grey outside.",
    tone: "Frustrated, then relieved.",
    pacing: "Held shots, few cuts.",
    transitions: "One cut per beat.",
    metaphor: "Waiting without living in a warehouse.",
    ending: "The boxes gone, the hall usable again.",
    ctaTreatment: "On-screen, over the empty hall.",
    beats: [
      {
        visual: "A hall of packed boxes with a SOLD board visible through the door glass.",
        caption: "Packed and waiting",
      },
      {
        visual: "A phone call taken standing between two towers of cartons.",
        caption: "The chain slipped",
      },
      {
        visual: "The same cartons in a clean, dry local space; the hall is clear.",
        caption: "Somewhere to put it",
      },
      {
        visual: "Someone sitting down in a normal, uncluttered hallway.",
        caption: "Live normally meanwhile",
      },
    ],
  },
  {
    id: "declutter",
    name: "Declutter",
    family: "SPACE",
    audience: "renters",
    hook: "You don't need less. You need it somewhere else.",
    setting: "A cluttered spare room, then the same room clear.",
    cast: "One person, sleeves up.",
    props: "Boxes, a sewing machine, a rowing machine, ski boots.",
    openingShot: "Straight-on symmetrical shot of the cluttered room.",
    cameraMovement: "Locked off; only the room changes.",
    lighting: "Even daylight, no drama.",
    tone: "Plain and honest.",
    pacing: "Simple before and after.",
    transitions: "One cut, same frame.",
    metaphor: "Space is the thing being bought back.",
    ending: "The identical frame, now empty and bright.",
    ctaTreatment: "One line on screen at the end.",
    beats: [
      { visual: "A spare room filled corner to corner, shot straight on.", caption: "Before" },
      {
        visual: "Hands labelling boxes; a rowing machine tipped on its side.",
        caption: "Nothing here is rubbish",
      },
      { visual: "The same boxes on racking in a dry local unit.", caption: "Stored nearby" },
      { visual: "The identical frame of the room: empty, light, usable.", caption: "After" },
    ],
  },
  {
    id: "furniture",
    name: "Furniture between homes",
    family: "MOVE",
    audience: "renters",
    hook: "A good sofa outlasts three tenancies.",
    setting: "A furnished rental where the tenant's own furniture has nowhere to go.",
    cast: "A young renter and a friend with a van.",
    props: "A wrapped sofa, a bookcase, moving blankets.",
    openingShot: "Close on furniture blankets being tucked around an armrest.",
    cameraMovement: "Handheld close work, one wide to finish.",
    lighting: "Evening interior, warm lamps.",
    tone: "Practical, affectionate.",
    pacing: "Even.",
    transitions: "Cuts on the wrap.",
    metaphor: "Keeping what you've already paid for.",
    ending: "The sofa in a new flat, a year later.",
    ctaTreatment: "Spoken over the new flat.",
    beats: [
      {
        visual: "A sofa being wrapped in moving blankets in a small flat.",
        caption: "Furnished rental, own sofa",
      },
      {
        visual: "Two people looking at a van and a sofa that has nowhere to go.",
        caption: "Sell it or store it",
      },
      {
        visual: "The wrapped sofa upright in a dry garage bay, breathable cover on.",
        caption: "Kept safe",
      },
      { visual: "The same sofa in a new flat with the cover coming off.", caption: "Still yours" },
    ],
  },
  {
    id: "business-stock",
    name: "Small business stock",
    family: "BUSINESS",
    audience: "renters",
    hook: "The spare room became the stockroom, then the whole house did.",
    setting: "A home-run online shop packing orders on a kitchen table.",
    cast: "A sole trader.",
    props: "Mailing bags, stock cartons, a label printer, a hallway of parcels.",
    openingShot: "Overhead of a kitchen table covered in mailing bags.",
    cameraMovement: "Top-down and tight; one wide reveal of the hallway.",
    lighting: "Bright kitchen daylight.",
    tone: "Busy, competent.",
    pacing: "Quick, purposeful.",
    transitions: "Cuts on parcel movement.",
    metaphor: "A business outgrowing a hallway.",
    ending: "The kitchen back to being a kitchen.",
    ctaTreatment: "Direct, businesslike.",
    beats: [
      {
        visual: "A kitchen table buried under mailing bags and a label printer.",
        caption: "Orders are good",
      },
      {
        visual: "A hallway lined both sides with stock cartons.",
        caption: "The house is the warehouse",
      },
      {
        visual: "The same cartons on shelving in a nearby lock-up, picked to order.",
        caption: "Stock stored locally",
      },
      { visual: "A cleared kitchen table with a cup of tea on it.", caption: "Home is home again" },
    ],
  },
  {
    id: "sports",
    name: "Sports kit",
    family: "SPACE",
    audience: "renters",
    hook: "Three bikes, one hallway.",
    setting: "A narrow flat hallway and a canal-side path.",
    cast: "Two housemates who cycle.",
    props: "Road bikes, a turbo trainer, kayak paddles, kit bags.",
    openingShot: "Hallway shot where a bike blocks the front door.",
    cameraMovement: "Follow shot behind a bike being wheeled out.",
    lighting: "Early morning, cool blue outside, warm inside.",
    tone: "Energetic.",
    pacing: "Quick cuts on movement.",
    transitions: "Cuts on wheels turning.",
    metaphor: "Kit you use shouldn't be kit in the way.",
    ending: "Two riders leaving a garage together.",
    ctaTreatment: "On-screen over the ride away.",
    beats: [
      {
        visual: "A narrow hallway with a bike wedged against the front door.",
        caption: "Three bikes, one hallway",
      },
      {
        visual: "A turbo trainer and kit bags stacked against the stairs.",
        caption: "And everything else",
      },
      {
        visual: "A nearby garage with bikes on wall hooks and kit on a shelf.",
        caption: "Stored near the ride",
      },
      {
        visual: "Two riders wheeling out of the garage onto a canal path.",
        caption: "Out before work",
      },
    ],
  },
  {
    id: "hobby",
    name: "Hobby workshop",
    family: "SPACE",
    audience: "renters",
    hook: "A hobby needs a bench, not a corner of the bedroom.",
    setting: "A model-maker's cramped bedroom corner, then a shared workshop bay.",
    cast: "One maker.",
    props: "A workbench, tool chest, timber offcuts, a half-built model boat.",
    openingShot: "Extreme close on a tiny brush and a cramped desk.",
    cameraMovement: "Macro details, then a slow reveal wide.",
    lighting: "Single desk lamp; later, clean daylight.",
    tone: "Focused, quiet.",
    pacing: "Slow, detailed.",
    transitions: "Cuts on tools being set down.",
    metaphor: "Room to actually make something.",
    ending: "The finished piece on the bench.",
    ctaTreatment: "Quiet on-screen line.",
    beats: [
      {
        visual: "A model half built on a bedroom desk, tools balanced on books.",
        caption: "No room to work",
      },
      {
        visual: "Timber and a tool chest stacked beside the bed.",
        caption: "The hobby has outgrown the house",
      },
      {
        visual: "A dry, lit bay in a local outbuilding with a bench set up.",
        caption: "A place for it",
      },
      {
        visual: "The finished model on a clean bench, tools racked behind.",
        caption: "Finished properly",
      },
    ],
  },
  {
    id: "garage-transform",
    name: "Garage transformation",
    family: "COMMUNITY",
    audience: "hosts",
    hook: "Your garage has never held a car.",
    setting: "A suburban garage full of things nobody uses.",
    cast: "A homeowner in their fifties.",
    props: "Paint tins, an old exercise bike, a broken lawnmower, shelving.",
    openingShot: "The garage door rolling up on chaos.",
    cameraMovement: "One continuous push in as the door rises.",
    lighting: "Daylight flooding a dim interior.",
    tone: "Wry, then satisfied.",
    pacing: "Middle-paced.",
    transitions: "Cuts on the door opening and closing.",
    metaphor: "A room you already own.",
    ending: "A swept, half-let bay with labelled boxes on one side.",
    ctaTreatment: "Host-facing spoken line.",
    beats: [
      {
        visual: "A garage door rolling up on paint tins, an exercise bike and a broken mower.",
        caption: "Never held a car",
      },
      {
        visual: "A hand switching on a strip light over a swept concrete floor.",
        caption: "It's a real room",
      },
      {
        visual: "Shelving up one wall and clean floor marked out in one bay.",
        caption: "Half of it could earn",
      },
      {
        visual: "Labelled boxes neatly in the marked bay, owner locking up.",
        caption: "Space that pays",
      },
    ],
  },
  {
    id: "spare-room-host",
    name: "Spare-room host",
    family: "COMMUNITY",
    audience: "hosts",
    hook: "The spare room is a very expensive cupboard.",
    setting: "A tidy but unused spare bedroom.",
    cast: "A homeowner working from the kitchen.",
    props: "An ironing board, a single bed nobody sleeps in, empty shelves.",
    openingShot: "Doorway shot of a still, unused room.",
    cameraMovement: "Static, composed frames.",
    lighting: "Cool, still, north-facing light.",
    tone: "Thoughtful.",
    pacing: "Calm.",
    transitions: "Simple cuts.",
    metaphor: "An asset sitting idle.",
    ending: "The same room, half of it neatly in use.",
    ctaTreatment: "Host-facing on-screen line.",
    beats: [
      {
        visual: "A spare bedroom, tidy and completely unused, door ajar.",
        caption: "Used twice a year",
      },
      {
        visual: "An ironing board and empty shelves in a room nobody enters.",
        caption: "Heated, cleaned, paid for",
      },
      {
        visual: "Neatly labelled boxes filling one half of the room.",
        caption: "Space someone nearby needs",
      },
      {
        visual: "The owner closing the door on a tidy, half-used room.",
        caption: "Make space earn",
      },
    ],
  },
  {
    id: "loft",
    name: "Loft and eaves",
    family: "SPACE",
    audience: "hosts",
    hook: "Boarded, lit, dry — and completely empty.",
    setting: "A boarded loft with a fixed ladder.",
    cast: "One homeowner with a torch.",
    props: "Loft boards, an old suitcase, a strip light, eaves shelving.",
    openingShot: "Torch beam across boarded floor from the hatch.",
    cameraMovement: "Up-through-the-hatch reveal.",
    lighting: "Torch then a bare strip light.",
    tone: "Discovery.",
    pacing: "Measured.",
    transitions: "Cuts on light switching on.",
    metaphor: "Finding a room you forgot about.",
    ending: "A tidy, boarded loft with a few labelled crates.",
    ctaTreatment: "Spoken host line.",
    beats: [
      { visual: "A torch beam sweeping across an empty boarded loft.", caption: "Boarded and dry" },
      {
        visual: "A strip light coming on to show clean boards and eaves shelving.",
        caption: "Already usable",
      },
      { visual: "A few labelled crates set neatly along one side.", caption: "Room to spare" },
      { visual: "The hatch closing on a tidy, useful loft.", caption: "Space that earns" },
    ],
  },
  {
    id: "affordable-renter",
    name: "Affordable local space",
    family: "COMMUNITY",
    audience: "renters",
    hook: "Self-storage quoted more than the car insurance.",
    setting: "A kitchen table with a laptop and a storage quote on screen.",
    cast: "One person comparing prices.",
    props: "A laptop, a printed quote, a mug, a notepad.",
    openingShot: "Over-the-shoulder on a quote figure.",
    cameraMovement: "Small, intimate handheld.",
    lighting: "Evening kitchen lamp light.",
    tone: "Level-headed.",
    pacing: "Conversational.",
    transitions: "Soft cuts.",
    metaphor: "Paying for a warehouse you never visit.",
    ending: "A short walk to a nearby garage instead of a drive to a park.",
    ctaTreatment: "Spoken, plain.",
    beats: [
      {
        visual: "A laptop on a kitchen table showing a storage quote, a mug beside it.",
        caption: "The quote came back high",
      },
      {
        visual: "A hand drawing a line under a monthly figure on a notepad.",
        caption: "Every month, indefinitely",
      },
      {
        visual: "A short walk down an ordinary street to a neighbour's garage.",
        caption: "Space nearby instead",
      },
      {
        visual: "Boxes going in through a garage side door, keys in hand.",
        caption: "Local, and less",
      },
    ],
  },
  {
    id: "before-after",
    name: "Before and after",
    family: "SPACE",
    audience: "both",
    hook: "Same room. Two Tuesdays apart.",
    setting: "One room, filmed twice from an identical position.",
    cast: "One person, briefly, in each half.",
    props: "Whatever the room held; then nothing.",
    openingShot: "Locked-off wide, tripod height, dead centre.",
    cameraMovement: "None at all. The frame never moves.",
    lighting: "Identical in both halves.",
    tone: "Matter of fact.",
    pacing: "Two long holds.",
    transitions: "A single hard cut in the middle.",
    metaphor: "Change you can measure.",
    ending: "The clear frame held for two full seconds.",
    ctaTreatment: "One line over the clear frame.",
    beats: [
      { visual: "A locked-off wide of a full room, absolutely still.", caption: "Tuesday" },
      {
        visual: "The same frame as a person carries the first box out.",
        caption: "One trip at a time",
      },
      {
        visual: "The same frame, half clear, boxes stacked outside the door.",
        caption: "Stored nearby",
      },
      {
        visual: "The identical frame, completely clear, held still.",
        caption: "Two Tuesdays later",
      },
    ],
  },
  {
    id: "problem-solution",
    name: "Cinematic problem and solution",
    family: "LIFE_EVENT",
    audience: "both",
    hook: "Every full house has a bottleneck.",
    setting: "Three different British homes, intercut.",
    cast: "Three unrelated households, briefly each.",
    props: "A blocked landing, a stacked porch, a crowded under-stairs.",
    openingShot: "Tight on a door that will not open fully.",
    cameraMovement: "Slow creeping pushes, all in the same direction.",
    lighting: "Moody, low-key, single practical lamps.",
    tone: "Cinematic and calm.",
    pacing: "Deliberate, building.",
    transitions: "Matched pushes across three houses.",
    metaphor: "Pressure released.",
    ending: "All three doors open freely.",
    ctaTreatment: "Single spoken line over the last door.",
    beats: [
      { visual: "A landing door stopping against a stack of crates.", caption: "It builds up" },
      {
        visual: "Intercut: a porch and an under-stairs, both full to the ceiling.",
        caption: "Every house has one",
      },
      {
        visual: "Boxes carried out to a neighbour's dry garage across three houses.",
        caption: "Space someone already has",
      },
      { visual: "Three doors, all swinging fully open.", caption: "Room to breathe" },
    ],
  },
  {
    id: "first-person",
    name: "First-person day",
    family: "LIFE_EVENT",
    audience: "renters",
    hook: "This is what my hallway looked like this morning.",
    setting: "A single flat, filmed as if by the person living in it.",
    cast: "One person, mostly hands and feet in frame.",
    props: "A phone, keys, a rucksack, boxes.",
    openingShot: "Point-of-view down at a hallway blocked by boxes.",
    cameraMovement: "Point-of-view throughout, natural sway.",
    lighting: "Whatever the day gives: dim hall, bright street.",
    tone: "Personal, unpolished, honest.",
    pacing: "Real time feel.",
    transitions: "Cuts as if between moments of a day.",
    metaphor: "Living around your own belongings.",
    ending: "Point-of-view walking into a clear hallway.",
    ctaTreatment: "Said to camera, informally.",
    beats: [
      {
        visual: "Point-of-view looking down a hallway you have to turn sideways to pass.",
        caption: "This morning",
      },
      {
        visual: "Point-of-view lifting a box to find three more behind it.",
        caption: "It's all still here",
      },
      {
        visual: "Point-of-view walking two streets and opening a garage side door.",
        caption: "Five minutes away",
      },
      { visual: "Point-of-view stepping into a clear, wide hallway.", caption: "This evening" },
    ],
  },
  {
    id: "local-community",
    name: "Local community",
    family: "COMMUNITY",
    audience: "both",
    hook: "One street. One person short of space, one with plenty.",
    setting: "A single British street, both sides.",
    cast: "Two neighbours who have never spoken.",
    props: "Two front doors, a wheelbarrow, a garage, a shared pavement.",
    openingShot: "Wide of the street from the middle of the road.",
    cameraMovement: "One slow crossing of the street.",
    lighting: "Late golden afternoon.",
    tone: "Neighbourly, gently optimistic.",
    pacing: "Even and unhurried.",
    transitions: "Cuts between the two houses, matched heights.",
    metaphor: "The answer is already on your street.",
    ending: "Two doors, one exchange, both people going back inside.",
    ctaTreatment: "Spoken over the street wide.",
    beats: [
      {
        visual: "A wide of an ordinary British street in late afternoon light.",
        caption: "One street",
      },
      {
        visual: "One house with a full porch; opposite, a garage with an empty bay.",
        caption: "Two problems, one answer",
      },
      {
        visual: "Boxes crossing the road on a sack barrow between the two houses.",
        caption: "Neighbours, not warehouses",
      },
      {
        visual: "Both front doors closing; the street quiet again.",
        caption: "Space where you live",
      },
    ],
  },
];

/** A compact record of what was actually filmed, stored on the campaign. */
export type CreativeSummary = {
  treatmentId: string;
  name: string;
  family: CreativeTreatment["family"];
  hook: string;
  setting: string;
  openingShot: string;
  ending: string;
  /** Which alternatives were skipped, and why — shown in the audit trail. */
  avoided: readonly string[];
};

function hash(value: string): number {
  let total = 0;
  for (let index = 0; index < value.length; index += 1) {
    total = (total * 31 + value.charCodeAt(index)) >>> 0;
  }
  return total;
}

/** How recently a treatment was used, most recent first. */
export type CreativeHistoryEntry = { treatmentId: string; family?: string | null };

/**
 * Two campaigns are "too similar" when they would film the same treatment, or
 * the same family back to back.
 */
export function isTooSimilar(
  candidate: CreativeTreatment,
  history: readonly CreativeHistoryEntry[],
): boolean {
  const recentIds = history.slice(0, 8).map((entry) => entry.treatmentId);
  if (recentIds.includes(candidate.id)) return true;
  const lastTwoFamilies = history.slice(0, 2).map((entry) => entry.family ?? null);
  return lastTwoFamilies.length === 2 && lastTwoFamilies.every((f) => f === candidate.family);
}

/**
 * Chooses the treatment for a campaign. Deterministic: the same campaign key,
 * date and history always give the same answer, so this can be re-run for free
 * and never causes a second paid render.
 */
export function selectCreativeTreatment(input: {
  /** Opportunity key + plan date: the campaign's own identity. */
  seed: string;
  audience?: "renters" | "hosts" | "both_sides" | string;
  history?: readonly CreativeHistoryEntry[];
}): { treatment: CreativeTreatment; summary: CreativeSummary } {
  const history = input.history ?? [];
  const wanted =
    input.audience === "hosts" ? "hosts" : input.audience === "renters" ? "renters" : null;

  const pool = CREATIVE_TREATMENTS.filter(
    (entry) => !wanted || entry.audience === wanted || entry.audience === "both",
  );
  const ordered = (pool.length > 0 ? pool : CREATIVE_TREATMENTS).slice();
  const start = hash(input.seed) % ordered.length;

  const avoided: string[] = [];
  let chosen: CreativeTreatment | null = null;
  for (let step = 0; step < ordered.length; step += 1) {
    const candidate = ordered[(start + step) % ordered.length]!;
    if (isTooSimilar(candidate, history)) {
      avoided.push(candidate.id);
      continue;
    }
    chosen = candidate;
    break;
  }
  // Every treatment used recently: fall back to the least recently used one
  // rather than repeating the most recent.
  if (!chosen) {
    const recency = new Map(history.map((entry, index) => [entry.treatmentId, index]));
    chosen = ordered
      .slice()
      .sort((a, b) => (recency.get(b.id) ?? 99) - (recency.get(a.id) ?? 99))[0]!;
  }

  return {
    treatment: chosen,
    summary: {
      treatmentId: chosen.id,
      name: chosen.name,
      family: chosen.family,
      hook: chosen.hook,
      setting: chosen.setting,
      openingShot: chosen.openingShot,
      ending: chosen.ending,
      avoided,
    },
  };
}

/** The lines added to the generation prompt so the film actually differs. */
export function treatmentDirectives(treatment: CreativeTreatment): string[] {
  return [
    `Creative treatment: ${treatment.name}. ${treatment.hook}`,
    `Setting: ${treatment.setting} Cast: ${treatment.cast} Props: ${treatment.props}`,
    `Opening shot: ${treatment.openingShot}`,
    `Camera: ${treatment.cameraMovement} Lighting: ${treatment.lighting}`,
    `Tone: ${treatment.tone} Pacing: ${treatment.pacing} Transitions: ${treatment.transitions}`,
    `Visual idea running through it: ${treatment.metaphor} Ending: ${treatment.ending}`,
    `Closing call to action treatment: ${treatment.ctaTreatment}`,
    "Do not reuse a generic hallway of cardboard boxes, a generic garage or a map pin unless the treatment above asks for it.",
  ];
}
