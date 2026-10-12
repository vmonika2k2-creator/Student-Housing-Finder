import { useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useListStudentHousingListings, getListStudentHousingListingsQueryKey } from '@workspace/api-client-react';
import { ListingCard } from '@/components/ListingCard';
import { AssistantPanel } from '@/components/AssistantPanel';
import { ArrowDown, ArrowRight, Bookmark, Check, ChevronDown, CircleHelp, Compass, MapPin, SlidersHorizontal, Sparkles, TrainFront } from 'lucide-react';
import { useLocation, Router as WouterRouter, Route, Switch } from 'wouter';
import { type ReactNode } from 'react';
import NotFound from '@/pages/not-found';
import './index.css';
import './housing.css';

const queryClient = new QueryClient();
const localImages = ['/images/student-home-01.jpg', '/images/student-home-02.jpg', '/images/student-home-03.jpg', '/images/student-home-04.jpg'];

function Home() {
  const { data, isLoading, isError, refetch } = useListStudentHousingListings({
    query: { queryKey: getListStudentHousingListingsQueryKey() },
  });
  const [city, setCity] = useState('All cities');
  const [roomType, setRoomType] = useState('Any room');
  const [maxRent, setMaxRent] = useState(24000);
  const [maxTransit, setMaxTransit] = useState(45);
  const [furnishedOnly, setFurnishedOnly] = useState(false);
  const [savedOnly, setSavedOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [saved, setSaved] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('student-housing-saved') ?? '[]') as string[]; }
    catch { return []; }
  });

  const listings = useMemo(() => (data ?? []).map((listing, index) => ({
    ...listing,
    imageUrl: localImages[index % localImages.length],
  })), [data]);
  const cities = useMemo(() => Array.from(new Set(listings.map((listing) => listing.city))).sort(), [listings]);
  const filtered = useMemo(() => listings.filter((listing) =>
    (city === 'All cities' || listing.city === city) &&
    (roomType === 'Any room' || listing.roomType === roomType) &&
    listing.monthlyRent <= maxRent &&
    listing.transitMinutes <= maxTransit &&
    (!furnishedOnly || listing.furnished) &&
    (!savedOnly || saved.includes(listing.id)) &&
    (!search.trim() || `${listing.title} ${listing.neighborhood} ${listing.city} ${listing.amenities.join(' ')}`.toLowerCase().includes(search.trim().toLowerCase()))
  ), [listings, city, roomType, maxRent, maxTransit, furnishedOnly, savedOnly, saved, search]);
  const sortedSavedListings = listings.filter((listing) => saved.includes(listing.id));

  function toggleSaved(id: string) {
    setSaved((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      localStorage.setItem('student-housing-saved', JSON.stringify(next));
      return next;
    });
  }
  function showListing(id: string) {
    document.getElementById(`listing-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function resetFilters() {
    setCity('All cities'); setRoomType('Any room'); setMaxRent(24000); setMaxTransit(45);
    setFurnishedOnly(false); setSavedOnly(false); setSearch('');
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" data-testid="link-home">
          <span className="brand-symbol"><Compass size={19} strokeWidth={2.2} /></span>
          <span>room<span className="brand-dot">.</span>for<small>student housing, less guesswork</small></span>
        </a>
        <nav className="topnav" aria-label="Main navigation">
          <a href="#homes" className="nav-link active" data-testid="link-browse-homes">Browse homes</a>
          <a href="#housing-assistant" className="nav-link" data-testid="link-housing-guide">Ask the guide</a>
        </nav>
        <button type="button" className={`saved-nav ${savedOnly ? 'selected' : ''}`} onClick={() => setSavedOnly((value) => !value)} data-testid="button-show-saved">
          <Bookmark size={16} fill={savedOnly ? 'currentColor' : 'none'} /> Saved <span>{saved.length}</span>
        </button>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy arrive">
            <div className="hero-kicker"><span className="kicker-dot" /> YOUR NEXT PLACE, MADE SIMPLER</div>
            <h1>Find a place that<br />fits <em>your kind</em> of life.</h1>
            <p>Compare the things that matter when you’re studying away from home—rent, privacy, and getting to class.</p>
            <a className="hero-cta" href="#homes" data-testid="link-explore-homes">Explore student homes <ArrowDown size={16} /></a>
          </div>
          <div className="hero-art arrive arrive-delay-1">
            <div className="art-note note-top"><TrainFront size={15} /> Your commute counts, too</div>
            <div className="hero-image-frame">
              <img src={localImages[0]} alt="A sunlit, furnished student bedroom" data-testid="img-hero-student-room" />
              <div className="image-caption"><span className="caption-pin"><MapPin size={14} /></span><span><strong>Room to settle in</strong><small>Illustrative student-home image</small></span></div>
            </div>
            <div className="art-note note-bottom"><span className="tiny-check"><Check size={13} /></span> Trade-offs, made clearer</div>
            <div className="hero-scribble" aria-hidden="true">a place to begin</div>
          </div>
          <div className="hero-stats arrive arrive-delay-2">
            <span><strong>3</strong> student cities</span><i />
            <span><strong>1</strong> clearer shortlist</span><i />
            <span><strong>₹</strong> budgets in INR</span>
          </div>
        </section>

        <div className="demo-banner" role="note" data-testid="status-demo-disclaimer">
          <span className="demo-icon"><CircleHelp size={16} /></span>
          <p><strong>Demo listings, not live availability.</strong> Every home and image here is illustrative. Confirm rent, safety, and availability directly before making plans.</p>
          <span className="demo-stamp">FOR EXPLORING ONLY</span>
        </div>

        <section className="workspace" id="homes">
          <div className="browse-column">
            <div className="section-heading arrive">
              <div><p className="eyebrow"><span className="heading-line" /> A more thoughtful shortlist</p><h2>Homes to compare</h2></div>
              <p className="section-aside">Start with what matters most.<br />You can change your mind anytime.</p>
            </div>
            <div className="search-row">
              <label className="searchbox"><MapPin size={18} /><span className="sr-only">Search neighborhood or amenity</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Try a neighborhood or amenity" data-testid="input-search-listings" /><span className="search-hint">SEARCH</span></label>
              <span className="filter-label"><SlidersHorizontal size={15} /> YOUR FILTERS</span>
            </div>

            <div className="filter-bar" data-testid="panel-listing-filters">
              <label className="filter-control"><span className="filter-caption">City</span><span className="select-wrap"><select value={city} onChange={(event) => setCity(event.target.value)} aria-label="Filter by city" data-testid="select-city"><option>All cities</option>{cities.map((name) => <option key={name}>{name}</option>)}</select><ChevronDown size={15} /></span></label>
              <label className="filter-control"><span className="filter-caption">Room style</span><span className="select-wrap"><select value={roomType} onChange={(event) => setRoomType(event.target.value)} aria-label="Filter by room style" data-testid="select-room-type"><option>Any room</option><option>Shared room</option><option>Private room</option><option>Studio</option></select><ChevronDown size={15} /></span></label>
              <label className="rent-filter"><span className="filter-caption">Monthly budget <strong>Up to ₹{new Intl.NumberFormat('en-IN').format(maxRent)}</strong></span><input type="range" min="5000" max="40000" step="1000" value={maxRent} onChange={(event) => setMaxRent(Number(event.target.value))} aria-label="Maximum monthly budget" data-testid="range-max-rent" /></label>
              <label className="rent-filter commute-filter"><span className="filter-caption">Transit <strong>Under {maxTransit} min</strong></span><input type="range" min="10" max="90" step="5" value={maxTransit} onChange={(event) => setMaxTransit(Number(event.target.value))} aria-label="Maximum transit minutes" data-testid="range-max-transit" /></label>
              <button type="button" className={`furnished-toggle ${furnishedOnly ? 'on' : ''}`} aria-pressed={furnishedOnly} onClick={() => setFurnishedOnly((value) => !value)} data-testid="button-toggle-furnished"><span className="toggle-indicator">{furnishedOnly && <Check size={11} />}</span>Furnished</button>
            </div>

            <div className="results-toolbar">
              <p data-testid="text-results-count"><strong>{filtered.length}</strong> {filtered.length === 1 ? 'place' : 'places'} to compare{savedOnly ? ' · saved only' : ''}</p>
              <button type="button" className="clear-filters" onClick={resetFilters} data-testid="button-reset-filters">Reset filters</button>
            </div>

            {isLoading && <div className="listing-grid" aria-label="Loading homes" data-testid="status-listings-loading">{[0, 1, 2, 3].map((item) => <div className="skeleton-card" key={item}><div className="skeleton skeleton-image" /><div className="skeleton-copy"><div className="skeleton skeleton-line wide" /><div className="skeleton skeleton-line" /><div className="skeleton skeleton-line short" /></div></div>)}</div>}
            {isError && <div className="state-card error-state" role="alert" data-testid="status-listings-error"><div className="state-icon"><CircleHelp size={22} /></div><h3>Homes aren’t loading right now.</h3><p>Give it a moment and try again. Your saved places are still here.</p><button type="button" className="button-primary" onClick={() => void refetch()} data-testid="button-retry-listings">Try again <ArrowRight size={15} /></button></div>}
            {!isLoading && !isError && filtered.length === 0 && <div className="state-card empty-state" data-testid="status-listings-empty"><div className="state-icon"><Sparkles size={22} /></div><h3>{listings.length === 0 ? 'Your shortlist is getting ready.' : 'Nothing fits those filters just yet.'}</h3><p>{listings.length === 0 ? 'There are no illustrative homes to compare right now.' : 'Try widening your budget or looking at a different room style.'}</p><button type="button" className="button-primary" onClick={resetFilters} data-testid="button-empty-reset">Show all homes <ArrowRight size={15} /></button></div>}
            {!isLoading && !isError && filtered.length > 0 && <div className="listing-grid" data-testid="grid-listings">{filtered.map((listing, index) => <ListingCard key={listing.id} listing={listing} saved={saved.includes(listing.id)} onToggleSaved={toggleSaved} />)}</div>}

            <div className="compare-note" data-testid="text-compare-guidance"><span className="note-mark">i</span><p><strong>A useful reminder:</strong> the cheapest room isn’t always the lowest-cost choice. Check deposits, meals, late-night travel, and what’s included before you decide.</p></div>
            {sortedSavedListings.length > 0 && <div className="saved-summary" data-testid="text-saved-summary"><Bookmark size={15} fill="currentColor" /> You’ve kept {sortedSavedListings.length} {sortedSavedListings.length === 1 ? 'place' : 'places'} on your shortlist. Use Saved above to compare them again.</div>}
          </div>
          <AssistantPanel listings={listings} onShowListing={showListing} />
        </section>

        <section className="closing-note" data-testid="panel-next-steps">
          <div className="closing-mark"><Sparkles size={19} /></div>
          <div><p className="eyebrow">One step at a time</p><h2>You don’t need the perfect answer today.</h2><p>Save a few options, talk through your priorities, then ask the questions that matter before you visit.</p></div>
          <a href="#homes" data-testid="link-back-to-homes">Back to homes <ArrowRight size={15} /></a>
        </section>
      </main>
      <footer className="footer"><a className="brand footer-brand" href="/" data-testid="link-footer-home"><span className="brand-symbol"><Compass size={16} /></span><span>room<span className="brand-dot">.</span>for</span></a><p>Made for the move away from home.</p><span>Illustrative content · Bengaluru · Pune · Hyderabad</span></footer>
    </div>
  );
}

function Router() {
  return <RoutedErrorBoundary><Switch><Route path="/" component={Home} /><Route component={NotFound} /></Switch></RoutedErrorBoundary>;
}
function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}
function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;
