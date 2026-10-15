import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { StudentHousingListing } from '@workspace/api-client-react';
import { ListingCard } from '@/components/ListingCard';
import { AssistantPanel } from '@/components/AssistantPanel';
import { ArrowDown, ArrowRight, Bookmark, Check, ChevronDown, CircleHelp, Compass, Heart, MapPin, SlidersHorizontal, Sparkles, TrainFront } from 'lucide-react';
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
type SavedListingRecord = { id: string; savedAt: string; listing: StudentHousingListing | null };
const SAVED_STORAGE_KEY = 'student-housing-saved';

function readSavedListings(): SavedListingRecord[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SAVED_STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry): SavedListingRecord[] => {
      if (typeof entry === 'string') return [{ id: entry, savedAt: '', listing: null }];
      if (typeof entry !== 'object' || entry === null || !('id' in entry) || typeof entry.id !== 'string') return [];
      const listing = 'listing' in entry && typeof entry.listing === 'object' && entry.listing !== null && 'id' in entry.listing
        ? entry.listing as StudentHousingListing
        : null;
      return [{ id: entry.id, savedAt: 'savedAt' in entry && typeof entry.savedAt === 'string' ? entry.savedAt : '', listing }];
    });
  } catch { return []; }
}

function useSavedListings() {
  const [records, setRecords] = useState<SavedListingRecord[]>(readSavedListings);
  useEffect(() => { localStorage.setItem(SAVED_STORAGE_KEY, JSON.stringify(records)); }, [records]);
  return [records, setRecords] as const;
}

function ListingComparison({ listings, onRemove }: { listings: StudentHousingListing[]; onRemove: (id: string) => void }) {
  if (listings.length === 0) return null;
  return <div className="shortlist-compare" data-testid="panel-shortlist-comparison">
    <div className="compare-panel-heading"><div><p className="eyebrow">SIDE-BY-SIDE</p><h3>Compare your shortlist</h3></div><span>{listings.length}/3 places</span></div>
    {listings.length < 2 && <p>Add one more place to compare rent, furnishing, deposit, and features side by side.</p>}
    {listings.length > 1 && <div className="shortlist-compare-scroll"><table><thead><tr><th>Place</th><th>Rent/month</th><th>Type and BHK</th><th>Furnishing</th><th>Deposit</th><th>Distance</th><th>Area</th><th>Property amenities</th><th>Action</th></tr></thead><tbody>
      {listings.map((listing) => <tr key={listing.id}><th scope="row">{listing.title}<br /><small>{listing.neighborhood}, {listing.city}</small></th><td>{listing.monthlyRent === null ? 'Not listed' : `₹${new Intl.NumberFormat('en-IN').format(listing.monthlyRent)}`}</td><td>{listing.propertyType ?? listing.roomType}{listing.bedrooms ? ` · ${listing.bedrooms}` : ''}</td><td>{listing.furnishingStatus ?? (listing.furnished === null ? 'Not listed' : listing.furnished ? 'Furnished' : 'Unfurnished')}</td><td>{listing.deposit ?? 'Not listed'}</td><td>{listing.distanceKm == null ? 'Not provided' : `${listing.distanceKm} km from landmark`}</td><td>{listing.area ?? 'Not listed'}</td><td>{listing.amenities.length ? listing.amenities.slice(0, 3).join(', ') : 'Not listed'}</td><td><button type="button" className="compare-remove" onClick={() => onRemove(listing.id)}>Remove</button></td></tr>)}
    </tbody></table></div>}
    <p>Source listings only; confirm current availability and terms with the listing contact.</p>
  </div>;
}

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
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [savedRecords, setSavedRecords] = useSavedListings();
  const [comparisonIds, setComparisonIds] = useState<string[]>([]);
  const savedIds = useMemo(() => savedRecords.map((record) => record.id), [savedRecords]);

  const filtered = useMemo(() => listings.filter((listing) =>
    (!propertyType || listing.propertyType === propertyType) &&
    (!bedrooms || listing.bedrooms === bedrooms) &&
    (!minRent || listing.monthlyRent === null || listing.monthlyRent >= Number(minRent)) &&
    (!maxRent || listing.monthlyRent === null || listing.monthlyRent <= Number(maxRent)) &&
    (!furnishing || listing.furnishingStatus === furnishing)
  ), [listings, propertyType, bedrooms, minRent, maxRent, furnishing]);
  const comparedListings = comparisonIds.flatMap((id) => listings.filter((listing) => listing.id === id));

  async function searchRentals(event?: FormEvent<HTMLFormElement>, override?: Partial<{ location: string; landmark: string; minRent: string; maxRent: string; propertyType: string; bedrooms: string; furnishing: string; amenities: string[] }>): Promise<StudentHousingListing[]> {
    event?.preventDefault();
    const criteria = { location, landmark, minRent, maxRent, propertyType, bedrooms, furnishing, amenities, ...override };
    setLocation(criteria.location);
    setLandmark(criteria.landmark);
    setMinRent(criteria.minRent);
    setMaxRent(criteria.maxRent);
    setPropertyType(criteria.propertyType);
    setBedrooms(criteria.bedrooms);
    setFurnishing(criteria.furnishing);
    setAmenities(criteria.amenities);
    setIsLoading(true);
    setSearchError('');
    setSearchNote('');
    setHasSearched(true);
    try {
      const response = await fetch('/api/housing/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: criteria.location,
          ...(criteria.minRent ? { minMonthlyRent: Number(criteria.minRent) } : {}),
          ...(criteria.maxRent ? { maxMonthlyRent: Number(criteria.maxRent) } : {}),
          ...(criteria.bedrooms ? { bedrooms: criteria.bedrooms } : {}),
          ...(criteria.propertyType ? { propertyType: criteria.propertyType } : {}),
          ...(criteria.furnishing ? { furnishing: criteria.furnishing } : {}),
          ...(criteria.amenities.length ? { amenities: criteria.amenities } : {}),
          ...(criteria.landmark.trim() ? { landmark: criteria.landmark.trim() } : {}),
        }),
      });
      const payload = await response.json() as RentalSearchResponse | { error?: string };
      if (!response.ok) throw new Error('error' in payload ? payload.error ?? `Search failed (${response.status}).` : `Search failed (${response.status}).`);
      const result = payload as RentalSearchResponse;
      setListings(result.listings);
      setSavedRecords((current) => {
        const latest = new Map(result.listings.map((listing) => [listing.id, listing]));
        return current.map((record) => latest.has(record.id) ? { ...record, listing: latest.get(record.id) ?? record.listing } : record);
      });
      setComparisonIds([]);
      setTotalResults(result.total);
      setSearchNote(result.note ?? '');
      return result.listings;
    } catch (error) {
      setListings([]);
      setTotalResults(0);
      setSearchError(error instanceof Error ? error.message : 'The live rental search failed. Please try again.');
      return [];
    } finally {
      setIsLoading(false);
    }
  }

  function toggleSaved(listing: StudentHousingListing) {
    setSavedRecords((current) => current.some((record) => record.id === listing.id)
      ? current.filter((record) => record.id !== listing.id)
      : [...current, { id: listing.id, savedAt: new Date().toISOString(), listing }]);
  }
  function toggleCompare(id: string) {
    setComparisonIds((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : current.length >= 3 ? current : [...current, id]);
  }
  function showListing(id: string) {
    document.getElementById(`listing-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function resetFilters() {
    setLocation('Pune'); setLandmark(''); setMinRent(''); setMaxRent('30000');
    setPropertyType(''); setBedrooms(''); setFurnishing(''); setAmenities([]);
    setListings([]); setTotalResults(0); setHasSearched(false); setSearchError(''); setComparisonIds([]);
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
        <a className="saved-nav" href="/saved" data-testid="button-show-saved"><Bookmark size={16} /> Saved <span>{savedRecords.length}</span></a>
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
              <p data-testid="text-results-count"><strong>{filtered.length}</strong> {filtered.length === 1 ? 'place' : 'places'} shown{hasSearched ? ` · ${new Intl.NumberFormat('en-IN').format(totalResults)} total matches` : ''}</p>
              <button type="button" className="clear-filters" onClick={resetFilters} data-testid="button-reset-filters">Reset filters</button>
            </div>
            {comparisonIds.length > 0 && <ListingComparison listings={comparedListings} onRemove={toggleCompare} />}

            {isLoading && <div className="listing-grid" aria-label="Loading homes" data-testid="status-listings-loading">{[0, 1, 2, 3].map((item) => <div className="skeleton-card" key={item}><div className="skeleton skeleton-image" /><div className="skeleton-copy"><div className="skeleton skeleton-line wide" /><div className="skeleton skeleton-line" /><div className="skeleton skeleton-line short" /></div></div>)}</div>}
            {searchError && <div className="state-card error-state" role="alert" data-testid="status-listings-error"><div className="state-icon"><CircleHelp size={22} /></div><h3>Live listings couldn’t be loaded.</h3><p>{searchError}</p><button type="button" className="button-primary" onClick={() => void searchRentals()} data-testid="button-retry-listings">Try again <ArrowRight size={15} /></button></div>}
            {!isLoading && !searchError && hasSearched && filtered.length === 0 && <div className="state-card empty-state" data-testid="status-listings-empty"><div className="state-icon"><Sparkles size={22} /></div><h3>We couldn’t find matching rentals.</h3><p>Try widening the rent range, removing an amenity, or searching another Pune locality. Square Yards’ amenity data can be sparse.</p><button type="button" className="button-primary" onClick={resetFilters} data-testid="button-empty-reset">Reset search <ArrowRight size={15} /></button></div>}
            {!isLoading && !searchError && !hasSearched && <div className="state-card empty-state" data-testid="status-listings-ready"><div className="state-icon"><Sparkles size={22} /></div><h3>Search current Pune rental listings.</h3><p>Choose a locality, budget, and any must-haves above, then search Square Yards.</p></div>}
            {!isLoading && !searchError && filtered.length > 0 && <div className="listing-grid" data-testid="grid-listings">{filtered.map((listing) => <ListingCard key={listing.id} listing={listing} saved={savedIds.includes(listing.id)} onToggleSaved={toggleSaved} isCompared={comparisonIds.includes(listing.id)} onToggleCompare={toggleCompare} compareDisabled={comparisonIds.length >= 3} />)}</div>}

            {searchNote && <p className="search-source-note" data-testid="text-search-source-note">{searchNote}</p>}

            <div className="compare-note" data-testid="text-compare-guidance"><span className="note-mark">i</span><p><strong>A useful reminder:</strong> the cheapest room isn’t always the lowest-cost choice. Check deposits, meals, late-night travel, and what’s included before you decide.</p></div>
            {savedRecords.length > 0 && <div className="saved-summary" data-testid="text-saved-summary"><Bookmark size={15} fill="currentColor" /> You’ve saved {savedRecords.length} {savedRecords.length === 1 ? 'place' : 'places'}. Open Saved above to see or compare them.</div>}
          </div>
        </section>
        <AssistantPanel listings={listings} comparisonListings={comparedListings} onSearch={(criteria) => searchRentals(undefined, {
            location: criteria.location,
            landmark: criteria.landmark,
            minRent: criteria.minRent,
            maxRent: criteria.maxRent,
            propertyType: criteria.propertyType,
            bedrooms: criteria.bedrooms,
            furnishing: criteria.furnishing,
            amenities: criteria.amenities,
          })} savedIds={savedIds} onToggleSaved={toggleSaved} comparisonIds={comparisonIds} onToggleCompare={toggleCompare} onShowListing={showListing} open={assistantOpen} onOpenChange={setAssistantOpen} />

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

function SavedHomesPage() {
  const [records, setRecords] = useSavedListings();
  const [comparisonIds, setComparisonIds] = useState<string[]>([]);
  const listings = records.flatMap((record) => record.listing ? [record.listing] : []);
  const comparedListings = comparisonIds.flatMap((id) => listings.filter((listing) => listing.id === id));

  function removeSaved(id: string) {
    setRecords((current) => current.filter((record) => record.id !== id));
    setComparisonIds((current) => current.filter((item) => item !== id));
  }
  function toggleCompare(id: string) {
    setComparisonIds((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : current.length >= 3 ? current : [...current, id]);
  }

  return <div className="app-shell saved-page">
    <header className="topbar">
      <a className="brand" href="/" data-testid="link-saved-home"><span className="brand-symbol"><Compass size={19} strokeWidth={2.2} /></span><span>room<span className="brand-dot">.</span>for<small>student housing, less guesswork</small></span></a>
      <nav className="topnav" aria-label="Main navigation"><a href="/" className="nav-link" data-testid="link-browse-homes">Browse homes</a><span className="nav-link active" aria-current="page">Saved places</span></nav>
      <span className="saved-nav selected"><Bookmark size={16} /> Saved <span>{records.length}</span></span>
    </header>
    <main className="saved-page-main">
      <div className="section-heading"><div><p className="eyebrow"><span className="heading-line" /> YOUR SHORTLIST</p><h1>Saved places</h1></div><p className="section-aside">Your saved listings stay in this browser<br />so you can come back and compare.</p></div>
      {comparisonIds.length > 0 && <ListingComparison listings={comparedListings} onRemove={toggleCompare} />}
      {listings.length > 0 && <div className="listing-grid" data-testid="grid-saved-listings">{listings.map((listing) => <ListingCard key={listing.id} listing={listing} saved onToggleSaved={() => removeSaved(listing.id)} isCompared={comparisonIds.includes(listing.id)} onToggleCompare={toggleCompare} compareDisabled={comparisonIds.length >= 3} />)}</div>}
      {records.some((record) => !record.listing) && <div className="saved-legacy-note" role="status"><Bookmark size={16} /><p>Some older saved items contain only their IDs, not listing details. Search again on Browse homes; matching saved listings will refill their details here.</p></div>}
      {records.length === 0 && <div className="state-card empty-state" data-testid="status-saved-empty"><div className="state-icon"><Heart size={22} /></div><h2>No saved places yet</h2><p>On Browse homes, choose <strong>Save for later</strong> on any listing. It will appear here, even after you leave the page.</p><a className="button-primary" href="/">Browse current listings <ArrowRight size={15} /></a></div>}
      <div className="saved-availability-note"><CircleHelp size={16} /><p>These are saved Square Yards listings. Their current availability is not verified here; use each listing link to check with its contact.</p></div>
    </main>
    <footer className="footer"><a className="brand footer-brand" href="/" data-testid="link-footer-home"><span className="brand-symbol"><Compass size={16} /></span><span>room<span className="brand-dot">.</span>for</span></a><p>Made for the move away from home.</p><span>Saved on this browser</span></footer>
  </div>;
}

function Router() {
  return <RoutedErrorBoundary><Switch><Route path="/" component={Home} /><Route path="/saved" component={SavedHomesPage} /><Route path="/admin" component={Admin} /><Route component={NotFound} /></Switch></RoutedErrorBoundary>;
}
function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}
function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;
