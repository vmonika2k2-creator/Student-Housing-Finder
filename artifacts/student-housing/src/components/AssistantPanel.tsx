import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, ArrowUpRight, LoaderCircle, MessageCircle, Send, Sparkles } from 'lucide-react';
import { useSendStudentHousingChat, type StudentHousingListing } from '@workspace/api-client-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

type Message = { role: 'user' | 'assistant'; content: string };
type Props = {
  listings: StudentHousingListing[];
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

export function AssistantPanel({ listings, onShowListing, open, onOpenChange }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId] = useState(() => crypto.randomUUID());
  const [draft, setDraft] = useState('');
  const [moveInUrgency, setMoveInUrgency] = useState<'flexible' | 'soon' | 'urgent'>('flexible');
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const chat = useSendStudentHousingChat();
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // On wide screens the page makes room for the open panel instead of sitting under it.
  useEffect(() => {
    document.body.classList.toggle('assistant-open', open);
    return () => document.body.classList.remove('assistant-open');
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, chat.isPending]);

  async function sendMessage(value = draft) {
    const message = value.trim();
    if (!message || chat.isPending) return;
    setDraft('');
    setRecommendations([]);
    try {
      const response = await chat.mutateAsync({
        data: {
          conversationId,
          moveInUrgency,
          message,
          // Keep request history within the API's 12-message limit as the conversation grows.
          history: messages.slice(-12).map(({ role, content }) => ({ role, content })),
          listingIds: listings.map(({ id }) => id),
        },
      });
      setMessages((current) => [...current, { role: 'user', content: message }, { role: 'assistant', content: response.reply }]);
      setRecommendations(response.recommendedListingIds);
      requestAnimationFrame(() => inputRef.current?.focus());
    } catch {
      setDraft(message);
    }
  }

  const recommendationListings = recommendations
    .map((id) => listings.find((listing) => listing.id === id))
    .filter((listing): listing is StudentHousingListing => Boolean(listing));
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
        <DialogDescription className="sr-only">Ask questions and compare the illustrative student homes shown on this page.</DialogDescription>
        <aside className="assistant-panel" id="housing-assistant" data-testid="panel-housing-assistant">
          <div className="assistant-top">
            <div className="assistant-mark"><MessageCircle size={18} /></div>
            <div><p className="eyebrow">A little help, right here</p><h2>Talk it through</h2></div>
            <span className="online-dot" aria-label="Assistant ready" />
          </div>
          <div className="assistant-preferences" data-testid="panel-assistant-preferences">
            <label>Move-in timing<select value={moveInUrgency} onChange={(event) => setMoveInUrgency(event.target.value as 'flexible' | 'soon' | 'urgent')}><option value="flexible">Flexible</option><option value="soon">Within a month</option><option value="urgent">As soon as possible</option></select></label>
            <span className="urgency-note">I’ll adjust how supportive I am based on your timing.</span>
          </div>
          {messages.length === 0 ? (
            <div className="assistant-welcome" data-testid="text-assistant-intro">
              <span className="sparkle"><Sparkles size={16} /></span>
              <p>Not sure what to compromise on? Tell me what matters—budget, a door of your own, or a shorter commute.</p>
              <span className="assistant-note">I’ll help you find a next step using the homes shown here.</span>
            </div>
          ) : (
            <div className="message-list" aria-live="polite" data-testid="list-chat-messages">
              {messages.map((message, index) => (
                <div className={`chat-message ${message.role}`} key={`${index}-${message.role}`} data-testid={`message-${message.role}-${index}`}>
                  <span className="message-speaker">{message.role === 'user' ? 'You' : 'Your guide'}</span>
                  {message.role === 'assistant' ? <ReplyText text={message.content} /> : <p>{message.content}</p>}
                </div>
              ))}
              {chat.isPending && <div className="chat-message assistant pending-message" data-testid="status-chat-loading"><span className="message-speaker">Your guide</span><p><span className="typing-dots">Thinking through the trade-offs…</span></p></div>}
            {recommendationListings.length > 0 && (
              <div className="recommendation-box" data-testid="list-chat-recommendations">
                <p className="eyebrow">Worth a closer look</p>
                {recommendationListings.map((listing) => (
                  <button type="button" className="recommendation-link" key={listing.id} data-testid={`button-recommendation-${listing.id}`} onClick={() => openRecommendation(listing.id)}>
                    <span><strong>{listing.neighborhood}</strong><small>{listing.city}{listing.monthlyRent === null ? '' : ` · ₹${new Intl.NumberFormat('en-IN').format(listing.monthlyRent)}/mo`}{listing.distanceKm == null ? '' : ` · ${listing.distanceKm} km from landmark`}</small><small>Why it may fit: {listing.propertyType ?? listing.roomType}{listing.bedrooms ? `, ${listing.bedrooms}` : ''}{listing.furnishingStatus ? `, ${listing.furnishingStatus.toLowerCase()}` : ''}{listing.amenities.length ? `, with ${listing.amenities.slice(0, 2).join(' and ')}` : ''}. Availability is not verified.</small></span><ArrowRight size={16} />
                  </button>
                ))}
              </div>
            )}
              <div ref={endRef} className="chat-end" aria-hidden="true" />
            </div>
          )}
          {chat.isError && <div className="chat-error" role="alert" data-testid="status-chat-error">That didn’t go through. Check your connection and try again.</div>}
          {replyChips.length > 0 && <div className="quick-prompts" aria-label="Suggested replies">{replyChips.map((option) => <button type="button" key={option} disabled={chat.isPending} onClick={() => void sendMessage(option)}>{option}</button>)}</div>}
          {messages.length === 0 && <div className="quick-prompts">
            <p className="eyebrow">Try asking</p>
            {prompts.map((prompt, index) => <button type="button" key={prompt} data-testid={`button-quick-prompt-${index}`} disabled={chat.isPending || listings.length === 0} onClick={() => void sendMessage(prompt)}>{prompt}<ArrowRight size={13} /></button>)}
          </div>}
          <div className="chat-footer">
          <form className="chat-form" onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}>
            <label htmlFor="chat-input" className="sr-only">Ask about student housing</label>
            <textarea ref={inputRef} id="chat-input" rows={2} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} maxLength={1200} placeholder="Tell me what you're looking for…" data-testid="input-chat-message" />
            <button type="submit" disabled={!draft.trim() || chat.isPending || listings.length === 0} aria-label="Send message" data-testid="button-send-chat">
              {chat.isPending ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />}
            </button>
          </form>
          <p className="assistant-footnote">A guide, not a broker. Always check details in person.</p>
          <p className="privacy-note" data-testid="text-chat-privacy"><strong>Privacy note</strong> Messages are sent to OpenAI to generate replies. Please don’t share sensitive personal or financial details.</p>
          </div>
        </aside>
      </DialogContent>
    </Dialog>
  );
}
