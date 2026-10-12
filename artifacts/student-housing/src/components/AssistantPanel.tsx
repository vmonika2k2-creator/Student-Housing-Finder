import { useState } from 'react';
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
const prompts = ['Show me private rooms under ₹15,000', 'What feels easiest for the metro?', 'I want more privacy without a studio budget'];

export function AssistantPanel({ listings, onShowListing, open, onOpenChange }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const chat = useSendStudentHousingChat();

  async function sendMessage(value = draft) {
    const message = value.trim();
    if (!message || chat.isPending) return;
    setDraft('');
    setRecommendations([]);
    try {
      const response = await chat.mutateAsync({
        data: {
          message,
          history: messages.map(({ role, content }) => ({ role, content })),
          listingIds: listings.map(({ id }) => id),
        },
      });
      setMessages((current) => [...current, { role: 'user', content: message }, { role: 'assistant', content: response.reply }]);
      setRecommendations(response.recommendedListingIds);
    } catch {
      setDraft(message);
    }
  }

  const recommendationListings = recommendations
    .map((id) => listings.find((listing) => listing.id === id))
    .filter((listing): listing is StudentHousingListing => Boolean(listing));

  function openRecommendation(id: string) {
    onOpenChange(false);
    onShowListing(id);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
      <DialogContent className="assistant-dialog" data-testid="dialog-housing-assistant">
        <DialogTitle className="sr-only">Talk it through with your housing guide</DialogTitle>
        <DialogDescription className="sr-only">Ask questions and compare the illustrative student homes shown on this page.</DialogDescription>
        <aside className="assistant-panel" id="housing-assistant" data-testid="panel-housing-assistant">
          <div className="assistant-top">
            <div className="assistant-mark"><MessageCircle size={18} /></div>
            <div><p className="eyebrow">A little help, right here</p><h2>Talk it through</h2></div>
            <span className="online-dot" aria-label="Assistant ready" />
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
                  <p>{message.content}</p>
                </div>
              ))}
              {chat.isPending && <div className="chat-message assistant pending-message" data-testid="status-chat-loading"><span className="message-speaker">Your guide</span><p><span className="typing-dots">Thinking through the trade-offs…</span></p></div>}
            </div>
          )}
          {chat.isError && <div className="chat-error" role="alert" data-testid="status-chat-error">That didn’t go through. Check your connection and try again.</div>}
          {recommendationListings.length > 0 && (
            <div className="recommendation-box" data-testid="list-chat-recommendations">
              <p className="eyebrow">Worth a closer look</p>
              {recommendationListings.map((listing) => (
                <button type="button" className="recommendation-link" key={listing.id} data-testid={`button-recommendation-${listing.id}`} onClick={() => openRecommendation(listing.id)}>
                  <span><strong>{listing.neighborhood}</strong><small>{listing.city} · ₹{new Intl.NumberFormat('en-IN').format(listing.monthlyRent)}/mo</small></span><ArrowRight size={16} />
                </button>
              ))}
            </div>
          )}
          <div className="quick-prompts">
            <p className="eyebrow">Try asking</p>
            {prompts.map((prompt, index) => <button type="button" key={prompt} data-testid={`button-quick-prompt-${index}`} disabled={chat.isPending || listings.length === 0} onClick={() => void sendMessage(prompt)}>{prompt}<ArrowRight size={13} /></button>)}
          </div>
          <form className="chat-form" onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}>
            <label htmlFor="chat-input" className="sr-only">Ask about student housing</label>
            <textarea id="chat-input" rows={2} value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={1200} placeholder="Tell me what you're looking for…" data-testid="input-chat-message" />
            <button type="submit" disabled={!draft.trim() || chat.isPending || listings.length === 0} aria-label="Send message" data-testid="button-send-chat">
              {chat.isPending ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />}
            </button>
          </form>
          <p className="assistant-footnote">A guide, not a broker. Always check details in person.</p>
          <p className="privacy-note" data-testid="text-chat-privacy"><strong>Privacy note</strong> Messages are sent to OpenAI to generate replies. Please don’t share sensitive personal or financial details.</p>
        </aside>
      </DialogContent>
    </Dialog>
  );
}
