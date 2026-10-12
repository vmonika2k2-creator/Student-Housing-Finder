import { ArrowUpRight, Heart, TrainFront, Sofa, Wifi } from 'lucide-react';
import type { StudentHousingListing } from '@workspace/api-client-react';

type Props = {
  listing: StudentHousingListing;
  saved: boolean;
  onToggleSaved: (id: string) => void;
  recommended?: boolean;
};

const rupees = (amount: number) =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(amount);

export function ListingCard({ listing, saved, onToggleSaved, recommended = false }: Props) {
  return (
    <article id={`listing-${listing.id}`} data-testid={`card-listing-${listing.id}`} className={`listing-card ${recommended ? 'listing-card-recommended' : ''}`}>
      <div className="listing-image-wrap">
        <img src={listing.imageUrl} alt={`${listing.roomType} in ${listing.neighborhood}`} className="listing-image" data-testid={`img-listing-${listing.id}`} />
        <span className="listing-tag" data-testid={`text-tag-${listing.id}`}>{listing.tag}</span>
        {recommended && <span className="match-tag">Suggested for you</span>}
        <button type="button" className={`save-button ${saved ? 'is-saved' : ''}`} aria-label={saved ? 'Remove from saved homes' : 'Save this home'} aria-pressed={saved} data-testid={`button-save-${listing.id}`} onClick={() => onToggleSaved(listing.id)}>
          <Heart size={18} fill={saved ? 'currentColor' : 'none'} />
        </button>
      </div>
      <div className="listing-copy">
        <div className="listing-heading">
          <div>
            <p className="eyebrow location-line" data-testid={`text-location-${listing.id}`}>{listing.neighborhood} <span>·</span> {listing.city}</p>
            <h3 data-testid={`text-title-${listing.id}`}>{listing.title}</h3>
          </div>
          <span className="room-pill">{listing.roomType}</span>
        </div>
        <div className="rent-line" data-testid={`text-rent-${listing.id}`}><strong>₹{rupees(listing.monthlyRent)}</strong><span>/ month</span></div>
        <div className="listing-facts">
          <span><TrainFront size={15} /> {listing.transitMinutes} min to transit</span>
          <span><Sofa size={15} /> {listing.furnished ? 'Furnished' : 'Unfurnished'}</span>
        </div>
        <div className="amenity-row" data-testid={`list-amenities-${listing.id}`}>
          {listing.amenities.slice(0, 3).map((amenity) => <span key={amenity}><Wifi size={13} />{amenity}</span>)}
        </div>
        <button className="card-link" type="button" data-testid={`button-view-${listing.id}`} onClick={() => document.getElementById(`listing-${listing.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
          Keep this one in mind <ArrowUpRight size={16} />
        </button>
      </div>
    </article>
  );
}
