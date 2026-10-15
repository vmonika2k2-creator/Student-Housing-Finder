import { useMemo, useState, type FormEvent } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { StudentHousingListing } from '@workspace/api-client-react';
import { ListingCard } from '@/components/ListingCard';
import { AssistantPanel } from '@/components/AssistantPanel';
import { ArrowDown, ArrowRight, Bookmark, Check, ChevronDown, CircleHelp, Compass, MapPin, SlidersHorizontal, Sparkles, TrainFront } from 'lucide-react';
import { useLocation, Router as WouterRouter, Route, Switch } from 'wouter';
import { type ReactNode } from 'react';
import NotFound from '@/pages/not-found';
import Admin from '@/pages/Admin';
import './index.css';
import './housing.css';

const queryClient = new QueryClient();
const localImages = ['/images/student-home-01.jpg', '/images/student-home-02.jpg', '/images/student-home-03.jpg', '/images/student-home-04.jpg'];
const propertyTypes = ['Apartment', 'Villa', 'Builder Floor', 'Independent House'];
const bedroomOptions = ['1 BHK', '2 BHK', '3 BHK', '4 BHK', 'Studio', '1 RK'];
const amenityOptions = [
  { value: 'parking', label: 'Parking' },
  { value: 'lift', label: 'Lift' },
  { value: 'gym', label: 'Gym' },
  { value: 'security', label: 'Security' },
] as const;

type RentalSearchResponse = { listings: StudentHousingListing[]; total: number; page: number; totalPages: number; note?: string };

function Home() {
  const [listings, setListings] = useState<StudentHousingListing[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [totalResults, setTotalResults] = useState(0);
  const [searchNote, setSearchNote] = useState('');
  const [location, setLocation] = useState('Pune');
  const [landmark, setLandmark] = useState('');
  const [minRent, setMinRent] = useState('');
  const [maxRent, setMaxRent] = useState('30000');
  const [propertyType, setPropertyType] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [furnishing, setFurnishing] = useState('');
  const [amenities, setAmenities] = useState<string[]>([]);
  const [savedOnly, setSavedOnly] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [saved, setSaved] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('student-housing-saved') ?? '[]') as string[]; }
    catch { return []; }
  });

  const filtered = useMemo(() => listings.filter((listing) =>
    (!propertyType || listing.propertyType === propertyType) &&
    (!bedrooms || listing.bedrooms === bedrooms) &&
    (!minRent || listing.monthlyRent === null || listing.monthlyRent >= Number(minRent)) &&
    (!maxRent || listing.monthlyRent === null || listing.monthlyRent <= Number(maxRent)) &&
    (!furnishing || listing.furnishingStatus === furnishing) &&
    (!savedOnly || saved.includes(listing.id))
  ), [listings, propertyType, bedrooms, minRent, maxRent, furnishing, savedOnly, saved]);
  const sortedSavedListings = listings.filter((listing) => saved.includes(listing.id));

  async function searchRentals(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setIsLoading(true);
    setSearchError('');
    setSearchNote('');
    setHasSearched(true);
    try {
      const response = await fetch('/api/housing/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location,
          ...(minRent ? { minMonthlyRent: Number(minRent) } : {}),
          ...(maxRent ? { maxMonthlyRent: Number(maxRent) } : {}),
          ...(bedrooms ? { bedrooms } : {}),
          ...(propertyType ? { propertyType } : {}),
          ...(furnishing ? { furnishing } : {}),
          ...(amenities.length ? { amenities } : {}),
          ...(landmark.trim() ? { landmark: landmark.trim() } : {}),
        }),
      });
      const payload = await response.json() as RentalSearchResponse | { error?: string };
      if (!response.ok) throw new Error('error' in payload ? payload.error ?? `Search failed (${response.status}).` : `Search failed (${response.status}).`);
      const result = payload as RentalSearchResponse;
      setListings(result.listings);
      setTotalResults(result.total);
      setSearchNote(result.note ?? '');
    } catch (error) {
      setListings([]);
      setTotalResults(0);
      setSearchError(error instanceof Error ? error.message : 'The live rental search failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

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
    setLocation('Pune'); setLandmark(''); setMinRent(''); setMaxRent('30000');
    setPropertyType(''); setBedrooms(''); setFurnishing(''); setAmenities([]);
    setSavedOnly(false); setListings([]); setTotalResults(0); setHasSearched(false); setSearchError('');
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
          <button type="button" className="nav-link nav-guide-link" onClick={() => setAssistantOpen(true)} data-testid="button-open-guide-nav">Ask the guide</button>
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
            <span><strong>1</strong> rental city</span><i />
            <span><strong>1</strong> clearer shortlist</span><i />
            <span><strong>₹</strong> budgets in INR</span>
          </div>
        </section>

        <div className="demo-banner live-banner" role="note" data-testid="status-squareyards-disclaimer">
          <span className="demo-icon"><CircleHelp size={16} /></span>
          <p><strong>Square Yards rental listings for Pune.</strong> Listing details come from the source; this app does not verify current availability. Confirm rent, deposit, and terms with the listing contact.</p>
          <span className="demo-stamp">LIVE SEARCH</span>
        </div>

        <section className="workspace" id="homes">
          <div className="browse-column">
            <div className="section-heading arrive">
              <div><p className="eyebrow"><span className="heading-line" /> A more thoughtful shortlist</p><h2>Homes to compare</h2></div>
              <p className="section-aside">Start with what matters most.<br />You can change your mind anytime.</p>
            </div>
            <form className="rental-search-form" onSubmit={(event) => void searchRentals(event)} data-testid="form-squareyards-search">
              <div className="search-row rental-search-row">
                <label className="searchbox"><MapPin size={18} /><span className="sr-only">Pune locality or area</span><input type="search" required value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Locality or area in Pune" data-testid="input-search-listings" /><span className="search-hint">PUNE</span></label>
                <label className="searchbox landmark-searchbox"><MapPin size={18} /><span className="sr-only">Nearby landmark</span><input type="search" value={landmark} onChange={(event) => setLandmark(event.target.value)} placeholder="Optional: search near a Pune landmark" data-testid="input-search-landmark" /></label>
                <button type="submit" className="button-primary rental-search-button" disabled={isLoading} data-testid="button-search-rentals">{isLoading ? 'Searching…' : 'Search rentals'} <ArrowRight size={15} /></button>
              </div>

              <div className="filter-bar rental-filter-bar" data-testid="panel-listing-filters">
                <label className="filter-control"><span className="filter-caption">Property type</span><span className="select-wrap"><select value={propertyType} onChange={(event) => setPropertyType(event.target.value)} aria-label="Filter by property type" data-testid="select-property-type"><option value="">Any type</option>{propertyTypes.map((name) => <option key={name}>{name}</option>)}</select><ChevronDown size={15} /></span></label>
                <label className="filter-control"><span className="filter-caption">BHK</span><span className="select-wrap"><select value={bedrooms} onChange={(event) => setBedrooms(event.target.value)} aria-label="Filter by BHK" data-testid="select-bedrooms"><option value="">Any BHK</option>{bedroomOptions.map((name) => <option key={name}>{name}</option>)}</select><ChevronDown size={15} /></span></label>
                <label className="rent-filter budget-input"><span className="filter-caption">Monthly rent from (₹)</span><input type="number" min="0" step="1000" value={minRent} onChange={(event) => setMinRent(event.target.value)} placeholder="No minimum" aria-label="Minimum monthly rent" data-testid="input-min-rent" /></label>
                <label className="rent-filter budget-input"><span className="filter-caption">Monthly rent up to (₹)</span><input type="number" min="0" step="1000" value={maxRent} onChange={(event) => setMaxRent(event.target.value)} placeholder="No maximum" aria-label="Maximum monthly rent" data-testid="input-max-rent" /></label>
                <label className="filter-control"><span className="filter-caption">Furnishing</span><span className="select-wrap"><select value={furnishing} onChange={(event) => setFurnishing(event.target.value)} aria-label="Filter by furnishing" data-testid="select-furnishing"><option value="">Any</option><option>Furnished</option><option>Semi-Furnished</option><option>Unfurnished</option></select><ChevronDown size={15} /></span></label>
              </div>
              <fieldset className="amenity-filters" data-testid="panel-amenity-filters"><legend>Property amenities</legend>{amenityOptions.map((option) => <label key={option.value}><input type="checkbox" checked={amenities.includes(option.value)} onChange={(event) => setAmenities((current) => event.target.checked ? [...current, option.value] : current.filter((item) => item !== option.value))} />{option.label}</label>)}<span>These are property amenities, not nearby services.</span></fieldset>
            </form>

            <div className="results-toolbar">
              <p data-testid="text-results-count"><strong>{filtered.length}</strong> {filtered.length === 1 ? 'place' : 'places'} shown{hasSearched ? ` · ${new Intl.NumberFormat('en-IN').format(totalResults)} total matches` : ''}{savedOnly ? ' · saved only' : ''}</p>
              <button type="button" className="clear-filters" onClick={resetFilters} data-testid="button-reset-filters">Reset filters</button>
            </div>
            {savedOnly && sortedSavedListings.length > 1 && <div className="shortlist-compare" data-testid="panel-shortlist-comparison">
              <h3>Compare your shortlist</h3>
              <div className="shortlist-compare-scroll"><table><thead><tr><th>Place</th><th>Rent/month</th><th>Type and BHK</th><th>Deposit</th><th>Distance</th><th>Property amenities</th></tr></thead><tbody>
                {sortedSavedListings.map((listing) => <tr key={listing.id}><th scope="row">{listing.neighborhood}</th><td>{listing.monthlyRent === null ? 'Not listed' : `₹${new Intl.NumberFormat('en-IN').format(listing.monthlyRent)}`}</td><td>{listing.propertyType ?? listing.roomType}{listing.bedrooms ? ` · ${listing.bedrooms}` : ''}<br />{listing.furnishingStatus ?? (listing.furnished === null ? 'Furnishing not listed' : listing.furnished ? 'Furnished' : 'Unfurnished')}</td><td>{listing.deposit ?? 'Not listed'}</td><td>{listing.distanceKm == null ? 'Not provided' : `${listing.distanceKm} km from landmark`}</td><td>{listing.amenities.length ? listing.amenities.slice(0, 2).join(', ') : 'No property amenities listed'}</td></tr>)}
              </tbody></table></div>
              <p>Compare the returned property facts; Square Yards does not verify availability for this app.</p>
            </div>}

            {isLoading && <div className="listing-grid" aria-label="Loading homes" data-testid="status-listings-loading">{[0, 1, 2, 3].map((item) => <div className="skeleton-card" key={item}><div className="skeleton skeleton-image" /><div className="skeleton-copy"><div className="skeleton skeleton-line wide" /><div className="skeleton skeleton-line" /><div className="skeleton skeleton-line short" /></div></div>)}</div>}
            {searchError && <div className="state-card error-state" role="alert" data-testid="status-listings-error"><div className="state-icon"><CircleHelp size={22} /></div><h3>Live listings couldn’t be loaded.</h3><p>{searchError}</p><button type="button" className="button-primary" onClick={() => void searchRentals()} data-testid="button-retry-listings">Try again <ArrowRight size={15} /></button></div>}
            {!isLoading && !searchError && hasSearched && filtered.length === 0 && <div className="state-card empty-state" data-testid="status-listings-empty"><div className="state-icon"><Sparkles size={22} /></div><h3>We couldn’t find matching rentals.</h3><p>Try widening the rent range, removing an amenity, or searching another Pune locality. Square Yards’ amenity data can be sparse.</p><button type="button" className="button-primary" onClick={resetFilters} data-testid="button-empty-reset">Reset search <ArrowRight size={15} /></button></div>}
            {!isLoading && !searchError && !hasSearched && <div className="state-card empty-state" data-testid="status-listings-ready"><div className="state-icon"><Sparkles size={22} /></div><h3>Search current Pune rental listings.</h3><p>Choose a locality, budget, and any must-haves above, then search Square Yards.</p></div>}
            {!isLoading && !searchError && filtered.length > 0 && <div className="listing-grid" data-testid="grid-listings">{filtered.map((listing) => <ListingCard key={listing.id} listing={listing} saved={saved.includes(listing.id)} onToggleSaved={toggleSaved} />)}</div>}

            {searchNote && <p className="search-source-note" data-testid="text-search-source-note">{searchNote}</p>}

            <div className="compare-note" data-testid="text-compare-guidance"><span className="note-mark">i</span><p><strong>A useful reminder:</strong> the cheapest room isn’t always the lowest-cost choice. Check deposits, meals, late-night travel, and what’s included before you decide.</p></div>
            {sortedSavedListings.length > 0 && <div className="saved-summary" data-testid="text-saved-summary"><Bookmark size={15} fill="currentColor" /> You’ve kept {sortedSavedListings.length} {sortedSavedListings.length === 1 ? 'place' : 'places'} on your shortlist. Use Saved above to compare them again.</div>}
          </div>
        </section>
        <AssistantPanel listings={listings} onShowListing={showListing} open={assistantOpen} onOpenChange={setAssistantOpen} />

        <section className="closing-note" data-testid="panel-next-steps">
          <div className="closing-mark"><Sparkles size={19} /></div>
          <div><p className="eyebrow">One step at a time</p><h2>You don’t need the perfect answer today.</h2><p>Save a few options, talk through your priorities, then ask the questions that matter before you visit.</p></div>
          <a href="#homes" data-testid="link-back-to-homes">Back to homes <ArrowRight size={15} /></a>
        </section>
      </main>
      <footer className="footer"><a className="brand footer-brand" href="/" data-testid="link-footer-home"><span className="brand-symbol"><Compass size={16} /></span><span>room<span className="brand-dot">.</span>for</span></a><p>Made for the move away from home.</p><span>Square Yards rental listings · Pune · Availability not verified</span></footer>
    </div>
  );
}

function Router() {
  return <RoutedErrorBoundary><Switch><Route path="/" component={Home} /><Route path="/admin" component={Admin} /><Route component={NotFound} /></Switch></RoutedErrorBoundary>;
}
function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}
function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;
