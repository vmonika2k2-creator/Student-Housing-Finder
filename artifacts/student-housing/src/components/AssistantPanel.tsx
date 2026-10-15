import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeftRight, ArrowRight, ArrowUpRight, ExternalLink, Heart, LoaderCircle, MessageCircle, Send, Sparkles } from 'lucide-react';
import { useSendStudentHousingChat, type StudentHousingListing } from '@workspace/api-client-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

type Message = { role: 'user' | 'assistant'; content: string };
type Feedback = 'Very helpful' | 'Somewhat helpful' | 'Not helpful';
type SearchCriteria = { location: string; landmark: string; minRent: string; maxRent: string; propertyType: string; bedrooms: string; furnishing: string; amenities: string[] };
type Props = {
  listings: StudentHousingListing[];
  onSearch: (criteria: SearchCriteria) => Promise<StudentHousingListing[]>;
  savedIds: string[];
  comparisonListings: StudentHousingListing[];
  onToggleSaved: (listing: StudentHousingListing) => void;
  comparisonIds: string[];
  onToggleCompare: (id: string) => void;
  onShowListing: (id: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};
// Turns "- point" lines into a real bullet list and leaves other lines as short paragraphs.
function inlineText(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : part,
  );
}
function ReplyText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let items: string[] = [];
  const flush = () => {
    if (items.length === 0) return;
    const list = items;
    blocks.push(<ul className="reply-list" key={`list-${blocks.length}`}>{list.map((item, index) => <li key={index}>{inlineText(item)}</li>)}</ul>);
    items = [];
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (bullet) { items.push(bullet[1]); continue; }
    flush();
    blocks.push(<p className="reply-line" key={`line-${blocks.length}`}>{inlineText(line)}</p>);
  }
  flush();
  return <>{blocks}</>;
}

const prompts = ['Show me private rooms under ₹15,000', 'What feels easiest for the metro?', 'I want more privacy without a studio budget'];

export function AssistantPanel({ listings, onSearch, savedIds, comparisonListings, onToggleSaved, comparisonIds, onToggleCompare, onShowListing, open, onOpenChange }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState(() => crypto.randomUUID());
  const [studentName, setStudentName] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const [ended, setEnded] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | ''>('');
  const [draft, setDraft] = useState('');
  const [moveInUrgency, setMoveInUrgency] = useState<'flexible' | 'soon' | 'urgent'>('flexible');
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const [searchedListings, setSearchedListings] = useState<StudentHousingListing[]>([]);
  const [searchCriteria, setSearchCriteria] = useState<SearchCriteria | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const chat = useSendStudentHousingChat();
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  function startNewConversation() {
    setConversationId(crypto.randomUUID());
    setMessages([{ role: 'user', content: `My name is ${studentName}.` }, { role: 'assistant', content: `Hi ${studentName}! What kind of place are you looking for?` }]);
    setRecommendations([]);
    setSearchedListings([]);
    setSearchCriteria(null);
    setFeedback('');
    setEnded(false);
    setDraft('');
  }

  function submitName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = nameDraft.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!name) return;
    setStudentName(name);
    setMessages([{ role: 'user', content: `My name is ${name}.` }, { role: 'assistant', content: `Hi ${name}! What kind of place are you looking for?` }]);
    setNameDraft('');
  }

  async function submitFeedback(value: Feedback) {
    setFeedback(value);
    try {
      await fetch(`/api/housing/conversations/${conversationId}/feedback`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feedback: value }),
      });
    } catch { /* The chat remains ended if the optional feedback request fails. */ }
  }

  // On wide screens the page makes room for the open panel instead of sitting under it.
  useEffect(() => {
    document.body.classList.toggle('assistant-open', open);
    return () => document.body.classList.remove('assistant-open');
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, chat.isPending, isSearching]);

  async function sendMessage(value = draft) {
    const message = value.trim();
    if (!message || chat.isPending || isSearching || ended || !studentName) return;
    setDraft('');
    setRecommendations([]);
    setMessages((current) => [...current, { role: 'user', content: message }]);
    try {
      const conversationText = [...messages.filter((item) => item.role === 'user').map((item) => item.content), message].join('\n').replace(/[‐‑‒–—]/g, '-');
      const rentRange = conversationText.match(/(?:₹|rs\.?\s*)([\d,]+)\s*(?:-|to)\s*(?:₹|rs\.?\s*)?([\d,]+)/i);
      const rent = rentRange?.[2]?.replace(/,/g, '') ?? conversationText.match(/(?:₹|rs\.?\s*)([\d,]+)\s*(?:\/\s*month|per\s+month|monthly)?/i)?.[1]?.replace(/,/g, '')
        ?? conversationText.match(/\b(?:under|below|max(?:imum)?(?: budget)?(?: of)?|budget(?: of)?)\s*(?:₹|rs\.?\s*)?([\d,]+)/i)?.[1]?.replace(/,/g, '');
      const bhk = conversationText.match(/\b(1\s*RK|studio|[1-4]\s*BHK)\b/i)?.[1]?.replace(/\s+/g, ' ').toUpperCase() ?? '';
      const locality = /loni\s+kalbhor/i.test(conversationText) ? 'Loni Kalbhor' : conversationText.match(/\b(?:in|near|around)\s+(loni\s+kalbhor|[a-z][a-z\s-]{1,40}?)(?=\s+(?:for|under|below|within|with|and|at|near|move|moving)\b|[,\n.]|$)/i)?.[1]?.trim();
      const requestedAmenities = (['parking', 'lift', 'gym', 'security'] as const).filter((amenity) => new RegExp(`\\b${amenity === 'gym' ? 'gym|gymnasium' : amenity}\\b`, 'i').test(conversationText));
      const isHousingSearch = /\b(find|show|search|looking for|need|want|shortlist|flat|apartment|room|rental|rentals)\b/i.test(message);
      const hasHousingIntent = /\b(find|show|search|looking for|need|want|shortlist|flat|apartment|room|rental|rentals)\b/i.test(conversationText);
      const hasCurrentSearchDetail = /(?:₹|rs\.?\s*[\d,]+|\bbudget\b.{0,12}\d|\b(?:under|below)\s*\d|\b(?:1\s*RK|studio|[1-4]\s*BHK)\b|loni\s+kalbhor|mit\s*-?\s*adt|university|\b(?:whole\s+)?flat\b|\b(?:furnished|semi[- ]?furnished|unfurnished)\b|\b(?:parking|lift|gym|gymnasium|security)\b)/i.test(message);
      const shouldSearch = hasHousingIntent && (listings.length === 0 ? isHousingSearch || hasCurrentSearchDetail : hasCurrentSearchDetail);
      const criteria: SearchCriteria = {
        location: locality && !/mit\s*-?\s*adt/i.test(locality) ? locality : 'Pune',
        landmark: /mit\s*-?\s*adt|university/i.test(conversationText) ? 'MIT ADT University' : '',
        minRent: rentRange?.[1]?.replace(/,/g, '') ?? '',
        maxRent: rent ?? '',
        propertyType: /\b(flat|whole flat|apartment)\b/i.test(conversationText) ? 'Apartment' : '',
        bedrooms: bhk,
        furnishing: /\bsemi[- ]?furnished\b/i.test(conversationText) ? 'Semi-Furnished' : /\bunfurnished\b/i.test(conversationText) ? 'Unfurnished' : /\bfurnished\b/i.test(conversationText) ? 'Furnished' : '',
        amenities: requestedAmenities,
      };
      setIsSearching(shouldSearch);
      let searchListings: StudentHousingListing[];
      try {
        searchListings = shouldSearch ? await onSearch(criteria) : listings;
      } finally {
        setIsSearching(false);
      }
      if (shouldSearch) {
        setSearchedListings(searchListings);
        setSearchCriteria(criteria);
      }
      const response = await chat.mutateAsync({
        data: {
          conversationId,
          moveInUrgency,
          message,
          // Retain enough context that earlier budget, location, and timing answers are not forgotten.
          history: messages.slice(-30).map(({ role, content }) => ({ role, content })),
          listingIds: searchListings.map(({ id }) => id),
        },
      });
      setMessages((current) => [...current, { role: 'assistant', content: response.reply }]);
      setRecommendations(response.recommendedListingIds);
      if (/\b(?:take care|conversation ended|glad i could help)\b/i.test(response.reply) && /\b(?:thanks?|thank ?you|bye|goodbye|that(?:'s| is) it|end conversation|end chat|done)\b/i.test(message)) setEnded(true);
      requestAnimationFrame(() => inputRef.current?.focus());
    } catch {
      setMessages((current) => current.at(-1)?.role === 'user' && current.at(-1)?.content === message ? current.slice(0, -1) : current);
      setDraft(message);
    }
  }

  const recommendationListings = recommendations
    .map((id) => searchedListings.find((listing) => listing.id === id) ?? listings.find((listing) => listing.id === id))
    .filter((listing): listing is StudentHousingListing => Boolean(listing));
  function whyThisListing(listing: StudentHousingListing): string {
    const reasons: string[] = [];
    if (searchCriteria?.maxRent && listing.monthlyRent !== null && listing.monthlyRent <= Number(searchCriteria.maxRent)) reasons.push(`within your ₹${new Intl.NumberFormat('en-IN').format(Number(searchCriteria.maxRent))}/month cap`);
    if (searchCriteria?.bedrooms && listing.bedrooms?.toLowerCase().replace(/\s+/g, '') === searchCriteria.bedrooms.toLowerCase().replace(/\s+/g, '')) reasons.push(`matches your ${searchCriteria.bedrooms} request`);
    if (searchCriteria?.propertyType && listing.propertyType?.toLowerCase() === searchCriteria.propertyType.toLowerCase()) reasons.push(`matches your ${searchCriteria.propertyType.toLowerCase()} preference`);
    if (searchCriteria?.furnishing && listing.furnishingStatus?.toLowerCase() === searchCriteria.furnishing.toLowerCase()) reasons.push(`matches your ${searchCriteria.furnishing.toLowerCase()} preference`);
    const matchedAmenities = searchCriteria?.amenities.filter((amenity) => listing.amenities.some((item) => item.toLowerCase().includes(amenity))) ?? [];
    if (matchedAmenities.length) reasons.push(`includes your requested ${matchedAmenities.join(' and ')}`);
    if (searchCriteria?.location && listing.neighborhood.toLowerCase().includes(searchCriteria.location.toLowerCase())) reasons.push(`listed in ${searchCriteria.location}`);
    if (!reasons.length && listing.monthlyRent !== null) reasons.push(`rent is ₹${new Intl.NumberFormat('en-IN').format(listing.monthlyRent)}/month`);
    if (!reasons.length && listing.amenities.length) reasons.push(`the listing includes ${listing.amenities.slice(0, 2).join(' and ')}`);
    return reasons.length ? reasons.join(' · ') : 'The source listing has limited details, so check its features and terms before deciding.';
  }
  const lastReply = messages.at(-1)?.role === 'assistant' ? messages.at(-1)?.content.toLowerCase() ?? '' : '';
  const replyChips = lastReply.includes('how close') || lastReply.includes('how far') || lastReply.includes('distance')
    ? ['Just a walk away', 'Under 1 km', '2–3 km away', 'Up to 5 km', 'Anywhere is fine']
    : lastReply.includes('property type') || lastReply.includes('private room, shared room')
      ? ['Flat', 'PG', 'Hostel', 'Shared room']
      : lastReply.includes('food') || lastReply.includes('mess')
        ? ['Attached mess', 'Tiffin', 'Kitchen to cook', 'No food needed']
        : lastReply.includes('must-have') || lastReply.includes('wifi')
          ? ['Wi-Fi', 'Attached washroom', 'Furnished', 'Safety features']
          : [];

  function openRecommendation(id: string) {
    onOpenChange(false);
    onShowListing(id);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogTrigger asChild>
        <button type="button" className="assistant-launcher" aria-haspopup="dialog" aria-label="Open the student housing guide" data-testid="button-open-housing-assistant">
          <span className="assistant-launcher-icon"><MessageCircle size={22} /></span>
          <span className="assistant-launcher-copy">
            <span className="assistant-launcher-kicker">YOUR STUDENT HOUSING GUIDE</span>
            <strong>Talk through your shortlist</strong>
            <small>Rent, privacy and commute trade-offs</small>
          </span>
          <ArrowUpRight className="assistant-launcher-arrow" size={18} />
        </button>
      </DialogTrigger>
      <DialogContent className="assistant-dialog" data-testid="dialog-housing-assistant" onInteractOutside={(event) => event.preventDefault()}>
        <DialogTitle className="sr-only">Talk it through with your housing guide</DialogTitle>
        <DialogDescription className="sr-only">Search current Pune rental listings, understand recommendations, and compare or save places.</DialogDescription>
        <aside className="assistant-panel" id="housing-assistant" data-testid="panel-housing-assistant">
          <div className="assistant-top">
            <div className="assistant-mark"><MessageCircle size={18} /></div>
            <div><p className="eyebrow">A little help, right here</p><h2>Talk it through</h2></div>
            <span className="online-dot" aria-label="Assistant ready" />
          </div>
          {studentName && <div className="assistant-preferences" data-testid="panel-assistant-preferences">
            <label>Move-in timing<select value={moveInUrgency} onChange={(event) => setMoveInUrgency(event.target.value as 'flexible' | 'soon' | 'urgent')}><option value="flexible">Flexible</option><option value="soon">Within a month</option><option value="urgent">As soon as possible</option></select></label>
            <span className="urgency-note">I’ll adjust how supportive I am based on your timing.</span>
          </div>}
          {messages.length === 0 ? (
            <div className="assistant-welcome" data-testid="text-assistant-intro">
              <span className="sparkle"><Sparkles size={16} /></span>
              <p>Hi! I’m your rental guide for homes near MIT ADT University, Pune.</p>
              <span className="assistant-note">First, what name should I use for you? I’ll keep replies short and show matching homes with reasons and easy compare/save actions.</span>
            </div>
          ) : (
            <div className="message-list" aria-live="polite" data-testid="list-chat-messages">
              {messages.map((message, index) => (
                <div className={`chat-message ${message.role}`} key={`${index}-${message.role}`} data-testid={`message-${message.role}-${index}`}>
                  <span className="message-speaker">{message.role === 'user' ? 'You' : 'Your guide'}</span>
                  {message.role === 'assistant' ? <ReplyText text={message.content} /> : <p>{message.content}</p>}
                </div>
              ))}
              {(isSearching || chat.isPending) && <div className="chat-message assistant pending-message" data-testid="status-chat-loading"><span className="message-speaker">Your guide</span><p><span className="typing-dots">{isSearching ? 'Searching current Pune listings…' : 'Reviewing the matches and trade-offs…'}</span></p></div>}
            {recommendationListings.length > 0 && (
              <div className="recommendation-box" data-testid="list-chat-recommendations">
                <p className="eyebrow">Your shortlist · compare at a glance</p>
                <div className="chat-listing-table-scroll"><table className="chat-listing-table"><thead><tr><th>Home</th><th>Rent</th><th>Type</th><th>Why it fits</th></tr></thead><tbody>{recommendationListings.map((listing, index) => <tr key={listing.id}><td><button type="button" className="chat-table-home" onClick={() => openRecommendation(listing.id)}>{listing.title}</button><small>{index === 0 ? 'Top match · ' : ''}{listing.neighborhood}</small></td><td>{listing.monthlyRent === null ? 'Not listed' : `₹${new Intl.NumberFormat('en-IN').format(listing.monthlyRent)}`}<small>/month</small></td><td>{listing.bedrooms ?? listing.propertyType ?? 'Not listed'}<small>{listing.furnishingStatus ?? ''}</small></td><td>{whyThisListing(listing)}{listing.distanceKm == null ? '' : ` · ${listing.distanceKm} km away`}<small>Confirm availability with the listing contact.</small></td></tr>)}</tbody></table></div>
                <details className="chat-option-details"><summary>View, save, or contact an option</summary>{recommendationListings.map((listing, index) => (
                  <div className="recommendation-option" key={listing.id} data-testid={`card-chat-recommendation-${listing.id}`}>
                    <button type="button" className="recommendation-link" data-testid={`button-recommendation-${listing.id}`} onClick={() => openRecommendation(listing.id)}>
                      <span><small className="recommendation-rank">{index === 0 ? 'TOP MATCH' : `SUGGESTION ${index + 1}`}</small><strong>{listing.title}</strong><small>{listing.neighborhood}, {listing.city}{listing.monthlyRent === null ? '' : ` · ₹${new Intl.NumberFormat('en-IN').format(listing.monthlyRent)}/mo`}{listing.distanceKm == null ? '' : ` · ${listing.distanceKm} km from landmark`}</small><small><b>Why I recommend it:</b> {whyThisListing(listing)}</small><small>Current source listing; confirm availability and terms with the listing contact.</small></span><ArrowRight size={16} />
                    </button>
                    <div className="recommendation-actions">
                      <button type="button" onClick={() => onToggleSaved(listing)} data-testid={`button-save-chat-recommendation-${listing.id}`}><Heart size={13} fill={savedIds.includes(listing.id) ? 'currentColor' : 'none'} />{savedIds.includes(listing.id) ? 'Saved' : 'Save for later'}</button>
                      <button type="button" disabled={!comparisonIds.includes(listing.id) && comparisonIds.length >= 3} onClick={() => onToggleCompare(listing.id)} data-testid={`button-compare-chat-recommendation-${listing.id}`}><ArrowLeftRight size={13} />{comparisonIds.includes(listing.id) ? 'Added to compare' : 'Compare'}</button>
                      {listing.listingUrl && <a href={listing.listingUrl} target="_blank" rel="noopener noreferrer" data-testid={`link-contact-chat-recommendation-${listing.id}`}>Contact via listing <ExternalLink size={12} /></a>}
                    </div>
                  </div>
                ))}</details>
              </div>
            )}
            {recommendationListings.length > 0 && !ended && <div className="chat-next-actions" aria-label="Next steps"><span>What next?</span><button type="button" onClick={() => recommendationListings.slice(0, 3).forEach((listing) => { if (!comparisonIds.includes(listing.id) && comparisonIds.length < 3) onToggleCompare(listing.id); })}>Compare these</button><button type="button" onClick={startNewConversation}>Search another</button><button type="button" onClick={() => void sendMessage('That’s it, thank you.')}>End conversation</button></div>}
            {comparisonListings.length > 0 && <div className="chat-compare" data-testid="panel-chat-comparison"><strong>Compare your shortlist · {comparisonListings.length}/3</strong>{comparisonListings.length < 2 && <p>Add one more place to compare them side by side.</p>}{comparisonListings.map((listing) => <div className="chat-compare-row" key={listing.id}><span><b>{listing.title}</b><small>{listing.neighborhood} · {listing.monthlyRent === null ? 'Rent not listed' : `₹${new Intl.NumberFormat('en-IN').format(listing.monthlyRent)}/mo`} · {listing.bedrooms ?? listing.propertyType ?? 'Type not listed'}</small></span><button type="button" onClick={() => onToggleCompare(listing.id)}>Remove</button></div>)}</div>}
              <div ref={endRef} className="chat-end" aria-hidden="true" />
            </div>
          )}
          {chat.isError && <div className="chat-error" role="alert" data-testid="status-chat-error">That didn’t go through. Check your connection and try again.</div>}
          {replyChips.length > 0 && <div className="quick-prompts" aria-label="Suggested replies">{replyChips.map((option) => <button type="button" key={option} disabled={chat.isPending || isSearching} onClick={() => void sendMessage(option)}>{option}</button>)}</div>}
          {studentName && messages.length <= 2 && !ended && <div className="quick-prompts">
            <p className="eyebrow">Try asking</p>
            {prompts.map((prompt, index) => <button type="button" key={prompt} data-testid={`button-quick-prompt-${index}`} disabled={chat.isPending || isSearching} onClick={() => void sendMessage(prompt)}>{prompt}<ArrowRight size={13} /></button>)}
          </div>}
          {!studentName && <form className="chat-name-form" onSubmit={submitName}><label htmlFor="student-first-name">Your first name</label><div><input id="student-first-name" autoComplete="given-name" maxLength={40} value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} placeholder="For example, Amina" /><button type="submit" disabled={!nameDraft.trim()} aria-label="Continue"><ArrowRight size={17} /></button></div><small>Your name and chat may be reviewed by the housing team to improve this service.</small></form>}
          {ended && <div className="chat-ended" role="status"><strong>Conversation ended. Thanks for chatting, {studentName}.</strong>{feedback ? <span>Thanks for your feedback.</span> : <><span>How helpful was this conversation?</span><div>{(['Very helpful', 'Somewhat helpful', 'Not helpful'] as Feedback[]).map((choice) => <button type="button" key={choice} onClick={() => void submitFeedback(choice)}>{choice}</button>)}</div></>}<button type="button" className="chat-new-search" onClick={startNewConversation}>Start another search</button></div>}
          <div className="chat-footer">
          {studentName && !ended && <form className="chat-form" onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}>
            <label htmlFor="chat-input" className="sr-only">Ask about student housing</label>
            <textarea ref={inputRef} id="chat-input" rows={2} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} maxLength={1200} placeholder="Tell me what you're looking for…" data-testid="input-chat-message" />
            <button type="submit" disabled={!draft.trim() || chat.isPending || isSearching} aria-label="Send message" data-testid="button-send-chat">
              {chat.isPending ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />}
            </button>
          </form>}
          <p className="assistant-footnote">A guide, not a broker. Always check details in person.</p>
          <p className="privacy-note" data-testid="text-chat-privacy"><strong>Privacy note</strong> Messages are sent to OpenAI to generate replies and stored so the housing team can review chats for service analysis. Please don’t share sensitive personal or financial details.</p>
          </div>
        </aside>
      </DialogContent>
    </Dialog>
  );
}
