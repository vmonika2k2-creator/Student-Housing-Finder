import { ArrowLeftRight, ArrowUpRight, ExternalLink, Heart, MapPin, Sofa, TrainFront } from 'lucide-react';
import type { StudentHousingListing } from '@workspace/api-client-react';

type Props = {
  listing: StudentHousingListing;
  saved: boolean;
  onToggleSaved: (listing: StudentHousingListing) => void;
  isCompared?: boolean;
  onToggleCompare?: (id: string) => void;
  compareDisabled?: boolean;
  recommended?: boolean;
  recommendationRank?: number;
};

const rupees = (amount: number) =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(amount);

export function ListingCard({ listing, saved, onToggleSaved, isCompared = false, onToggleCompare, compareDisabled = false, recommended = false, recommendationRank }: Props) {
  const furnishingLabel = listing.furnishingStatus ?? (listing.furnished === null ? 'Furnishing not listed' : listing.furnished ? 'Furnished' : 'Unfurnished');
  const rentLabel = listing.monthlyRent === null ? 'Rent not listed' : `₹${rupees(listing.monthlyRent)}`;
  return (
    <article id={`listing-${listing.id}`} data-testid={`card-listing-${listing.id}`} className={`listing-card ${recommended ? 'listing-card-recommended' : ''}`}>
      <div className="listing-image-wrap">
        {listing.imageUrl ? <img src={listing.imageUrl} alt={`${listing.roomType} in ${listing.neighborhood}`} className="listing-image" data-testid={`img-listing-${listing.id}`} /> : <div className="listing-image-placeholder" aria-label="No listing image supplied" />}
        <span className="listing-tag" data-testid={`text-tag-${listing.id}`}>{listing.tag}</span>
        {listing.isVerified === false && <span className="verification-tag">Source marks listing unverified</span>}
        {recommended && <span className="match-tag">{recommendationRank ? `Top match #${recommendationRank}` : 'Suggested for you'}</span>}
        <button type="button" className={`save-button ${saved ? 'is-saved' : ''}`} aria-label={saved ? 'Remove from saved homes' : 'Save this home'} aria-pressed={saved} data-testid={`button-save-${listing.id}`} onClick={() => onToggleSaved(listing)}>
          <Heart size={18} fill={saved ? 'currentColor' : 'none'} />
        </button>
      </div>
      <div className="listing-copy">
        <div className="listing-heading">
          <div>
            <p className="eyebrow location-line" data-testid={`text-location-${listing.id}`}>{listing.neighborhood} <span>·</span> {listing.city}</p>
            <h3 data-testid={`text-title-${listing.id}`}>{listing.title}</h3>
          </div>
            <span className="room-pill">{listing.propertyType ?? listing.roomType}</span>
        </div>
        <div className="rent-line" data-testid={`text-rent-${listing.id}`}><strong>{rentLabel}</strong>{listing.monthlyRent !== null && <span>/ month</span>}</div>
        <p className="availability-note">Current Square Yards listing · confirm availability with the listing contact</p>
        <div className="listing-facts">
          {listing.bedrooms && <span>{listing.bedrooms}</span>}
          {listing.area && <span>{listing.area}</span>}
          <span><Sofa size={15} /> {furnishingLabel}</span>
          {listing.distanceKm !== null && listing.distanceKm !== undefined && <span><MapPin size={15} /> {listing.distanceKm} km from selected landmark</span>}
          {listing.transitMinutes !== null && <span><TrainFront size={15} /> {listing.transitMinutes} min to transit</span>}
          {listing.deposit && <span>Deposit: {listing.deposit}</span>}
        </div>
        <div className="amenity-row" data-testid={`list-amenities-${listing.id}`}>
          {listing.amenities.slice(0, 5).map((amenity) => <span key={amenity}>{amenity}</span>)}
        </div>
        <details className="listing-why">
          <summary>Why consider it?</summary>
          <p>{[listing.propertyType, listing.bedrooms, listing.monthlyRent === null ? null : `₹${rupees(listing.monthlyRent)}/month`, furnishingLabel !== 'Furnishing not listed' ? furnishingLabel : null, listing.area, listing.distanceKm == null ? null : `${listing.distanceKm} km from the selected landmark`, listing.amenities.length ? `amenities include ${listing.amenities.slice(0, 2).join(' and ')}` : null].filter(Boolean).join(' · ') || 'The source did not provide enough details to explain a match.'}. These are source-provided details; confirm them before arranging a visit.</p>
        </details>
        <div className="listing-card-actions">
          <button className="card-link" type="button" data-testid={`button-view-${listing.id}`} onClick={() => onToggleSaved(listing)}>
            {saved ? 'Saved for later' : 'Save for later'} <ArrowUpRight size={16} />
          </button>
          {onToggleCompare && <button className={`card-link compare-card-action ${isCompared ? 'is-compared' : ''}`} type="button" aria-pressed={isCompared} disabled={!isCompared && compareDisabled} data-testid={`button-compare-${listing.id}`} onClick={() => onToggleCompare(listing.id)}><ArrowLeftRight size={15} />{isCompared ? 'Added to compare' : 'Compare'}</button>}
          {listing.listingUrl && <a className="card-link source-link" href={listing.listingUrl} target="_blank" rel="noopener noreferrer" data-testid={`link-original-listing-${listing.id}`}>Contact via listing <ExternalLink size={14} /></a>}
        </div>
      </div>
    </article>
  );
}
