# EarnRoom

We are building a production-quality, mobile-first UK peer-to-peer storage marketplace.

EarnRoom is the central trading name used throughout the application. Brand values live in `src/config/brand.ts` so future brand changes remain reversible.

The marketplace will eventually allow:

People who need storage (“Renters”) to find unused storage capacity nearby.

People who have unused garages, rooms, lofts, sheds, warehouses or portions of those spaces (“Hosts”) to earn money from them.

Renters to photograph belongings and use AI to estimate storage requirements.

The platform to intelligently match belongings with suitable nearby spaces.

Hosts and renters to transact through a secure, trust-focused marketplace.

DO NOT build all these features yet.

This first step is ONLY to create the application's professional design foundation, navigation architecture and reusable component system.

DESIGN OBJECTIVE

Create a premium consumer marketplace suitable for launch in the UK.

The design should feel:

Trustworthy
Modern
Friendly
Premium
Simple
Safe
Neighbourhood-focused
Technology-enabled

It should NOT feel:

Cheap
Experimental
Like a generic AI-generated website
Like a self-storage warehouse website
Overly corporate
Overly playful
Cluttered

Take UX inspiration from the simplicity and polish of leading consumer marketplaces, property platforms and fintech applications, but create an entirely original visual identity.

Do not copy another company's branding, layout, assets or protected design.

CORE BRAND MESSAGE

Primary renter proposition:

Your stuff. Space nearby.

Primary host proposition:

Got space? Make money.

AI proposition:

Show us your stuff. We'll help find the space.

Trust proposition:

Storage between people, built around trust.

COLOUR AND VISUAL DIRECTION

Create a restrained, trustworthy premium palette.

Use a clean light background with one strong primary brand colour and restrained supporting colours.

Use green/success styling for verified, protected and successful states.

Use amber/warning styling only where necessary.

Use red only for errors, destructive actions or serious warnings.

Do not use excessive gradients.

Do not use neon colours.

Create excellent accessible contrast.

TYPOGRAPHY

Use modern, highly legible typography suitable for mobile and desktop.

Create clear hierarchy for:

Hero headings
Section headings
Card titles
Body text
Labels
Prices
Trust badges
Buttons
Navigation

Typography should feel premium but friendly.

COMPONENT LIBRARY

Create reusable components for:

Primary button
Secondary button
Text button
Search field
Postcode search
Input field
Select/dropdown
Checkbox
Radio button
Toggle
Modal
Bottom sheet
Toast
Alert
Tabs
Navigation
Mobile bottom navigation
Cards
Listing card
Profile card
Host card
Renter card
Booking card
Inventory item card
Price display
Rating
Review
Verification badge
SpaceFit badge
Status badge
Progress indicator
Photo uploader
Empty state
Loading skeleton
Error state

Do not duplicate components unnecessarily.

TRUST COMPONENTS

Create reusable visual badges for:

Email Verified
Phone Verified
ID Verified
Address Verified
Space Verified
Payment Verified

Also create a generic:

Verified

badge.

Do not imply that verification guarantees safety or character.

SPACEFIT COMPONENT

Create a reusable SpaceFit component.

Example:

96% SpaceFit

Supporting text:

Excellent match for your belongings

Create visual states:

90–100 Excellent match
75–89 Good match
60–74 Possible match
Below 60 Poor match

SpaceFit must be described as an estimate and compatibility score, NOT a guarantee that belongings will physically fit.

LISTING CARD

Create a premium storage listing card capable of displaying:

Space photograph
Space type
Approximate area
Distance
Price per month
Host rating
Review count
Verification status
SpaceFit percentage
Security feature icons

Example:

Garage Space

Southsea

0.6 miles away

£49/month

★ 4.9 · 27 reviews

Verified Host

96% SpaceFit

USER TYPES

Prepare navigation architecture for:

RENTER

Home
Search
Bookings
Messages
Profile

HOST

Dashboard
My Spaces
Bookings
Messages
Earnings

ADMIN

Separate protected administration interface later.

Do not build admin functionality yet.

Users should eventually be able to switch between Host and Renter modes.

DESKTOP NAVIGATION

Create a clean top navigation.

Product logo:

EarnRoom

Navigation:

Find Storage
List Your Space
How It Works
Trust & Safety

Right side:

Log in

Primary CTA:

Get Started

MOBILE NAVIGATION

Create mobile-first navigation.

For logged-out visitors:

Logo
Menu
Get Started

Prepare logged-in renter bottom navigation:

Home
Search
Bookings
Messages
Profile

Prepare logged-in host bottom navigation:

Dashboard
Spaces
Bookings
Messages
Earnings

RESPONSIVE DESIGN

Design for:

Small phones
Modern iPhones
Android phones
Tablets
Laptop
Desktop

The mobile experience is the highest priority.

ACCESSIBILITY

Use:

Accessible contrast
Large touch targets
Keyboard navigation
Visible focus states
Semantic HTML
Accessible form labels
Alt-text architecture
Screen-reader-friendly controls

SECURITY ARCHITECTURE

Do not expose API keys or secrets in frontend code.

Prepare the project for:

Supabase
Stripe Connect
Maps
Identity verification
AI vision APIs

but DO NOT integrate those services yet.

Use environment variables for future secrets.

PROJECT STRUCTURE

Use clean, modular, maintainable architecture.

Create reusable:

Layout components
Navigation components
Marketplace components
Trust components
Storage components
User components

Do not put the entire application into one huge component/file.

ROUTES

Prepare route architecture for:

/

/find-storage

/list-space

/how-it-works

/trust

/login

/signup

/renter

/renter/search

/renter/bookings

/renter/messages

/renter/profile

/host

/host/spaces

/host/bookings

/host/messages

/host/earnings

Do not fully build these pages yet.

Create clean placeholders where appropriate.

DATA ARCHITECTURE

Do not connect the database yet.

However, define clean data models/interfaces for future:

User
HostProfile
RenterProfile
Space
SpacePhoto
Item
SearchRequest
SpaceMatch
Booking
Payment
Message
Review
Verification
Inventory
CheckIn
CheckOut
Dispute

UK MARKET REQUIREMENTS

Use:

GBP (£)
UK postcode conventions
UK spelling
UK date formatting

The initial pilot market will eventually be:

Portsmouth
Southsea
Fratton
Milton
Eastney
Copnor
North End
Hilsea
Cosham

Do not hard-code the product so that it cannot expand beyond Portsmouth.

IMPORTANT TRUST PRINCIPLE

This is a peer-to-peer marketplace involving people's homes and belongings.

Trust must therefore be a first-class part of the design.

Whenever appropriate, visually reinforce:

Identity verification
Declared belongings
Secure payments
Private addresses
Booking-based reviews
Digital check-in
Host-controlled access

However, do NOT make unsupported claims such as:

“100% safe”
“Guaranteed safe”
“Fully insured”
“Zero risk”

Insurance/protection language will be added only after the appropriate commercial arrangements exist.

THIS STEP ONLY

For this first build:

Establish the design system.

Create reusable UI components.

Create responsive navigation.

Establish route structure.

Create the data interfaces/models.

Create a simple internal component showcase/design-system page so I can inspect buttons, cards, badges, typography, form elements and SpaceFit components.

DO NOT yet build:

Full homepage
Authentication
Database
Host onboarding
Renter onboarding
Maps
AI
Payments
Messaging
Bookings
Reviews
Identity verification
Admin dashboard

After completing this step, provide a concise summary of:

What you created.

Project structure.

Reusable components.

Routes prepared.

Data models prepared.

Any technical decisions you made.

Then STOP and wait for my next instruction.

Do not proceed to additional marketplace features automatically.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://home-stash-link.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/5b8080b6-a154-4829-81fc-239dece1bc3a).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
