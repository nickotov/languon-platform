# Languon learning assistance

Glossary of product concepts agreed during design discovery. These definitions
describe intended behavior; they do not imply that the capabilities exist yet.

## Language

**Contextual language assistant**:
A conversational assistant opened from a dictionary, text, or knowledge note
that explains language, usage, and relevant cultural context, including learning
questions beyond the source topic. Its role excludes unrelated professional
tasks and proactive exercises or learning plans.
_Avoid_: Tutor, when referring specifically to this explanation widget.

**AI tutor**:
A future learning companion that guides learning and can use the contextual
language assistant's explanation and knowledge-saving capabilities.

**Knowledge note**:
A learner-owned, editable, self-contained language-learning document, including
explanations, learner-written essays, study documents and research notes. It
remains usable independently of the conversations and source material used to
create it. Notes are private by default; explicit sharing concerns the note,
not its private conversations.
_Avoid_: Chat message, when referring to saved knowledge.

**Knowledge workspace**:
The editing view of a knowledge note, combining its rich-text editor with a
private contextual conversation selected from that note's conversation history.
Its editor may remain empty during research. Saving updates that note; the owner's Save a copy creates an independent note
from the current working draft, without copying conversations.
_Avoid_: Workspace document, when implying a second kind of saved document.

**Working draft**:
The learner's private, recoverable document state before explicit Save, retained
across devices. It may exist before the note's first saved version, with an empty
editor and private conversations; shared readers see only an explicitly saved note.
_Avoid_: Knowledge note draft, which denotes an assistant's separate proposal.

**Shared note**:
The explicitly saved version of a note made readable through an unlisted link.
Private working drafts and conversations are excluded; recipients can copy the
saved note into their own Knowledge before editing or using the tutor.

**Note copy**:
A new, independent note containing the copied document and metadata, without
its original's chats, message attachments or revision history. Its owner may
edit it independently of later changes to the original.

**Editor proposal**:
An assistant-proposed insertion, addition or replacement that the learner can
review and explicitly accept into the editable note. Accepting a proposal and
saving a note are distinct learner actions.

**Knowledge note draft**:
A private, editable proposal retained with its conversation, for either a new
knowledge note or an update to an existing note. It becomes a saved note or
revision only through an explicit learner action.

**Knowledge note revision**:
A previously saved version of a knowledge note preserved when the learner saves
an update. A discussion about a note does not itself create a saved revision.

**Knowledge**:
The learner's personal collection of knowledge notes covering grammar, usage,
etymology, culture, and other language-learning topics.

**Knowledge category**:
One of the fixed topics used to organize knowledge notes: Grammar, Vocabulary &
meaning, Usage & register, Pronunciation, Etymology, Culture, or Learning tips.
A note can have multiple categories, suggested by AI and editable by the learner.

**Explanation language**:
The language the assistant uses to explain learning material, chosen explicitly
or automatically from the language the learner uses in their messages. It is
distinct from the language being studied and the app's interface language.

**AI chat preferences**:
The learner's preferred reply language, tone, and explanation level for
contextual conversations. Profile settings define defaults for new
conversations, while each conversation can override them.

**Copied attachment**:
Content explicitly copied into a chat message and visually distinguished from
the learner's question. It is a snapshot, independent of later changes or
availability of the original item, rather than a live resource link.

**Text attachment**:
An immutable copy of text, and optionally an explicitly selected translation,
attached to one chat message with a readable preview. It is learning material
for that conversation, not a live reference or a persistent workspace source.

**Editor context snapshot**:
The current note editor content, including unsaved edits, captured when the
learner sends a message. Subsequent edits do not change the wording associated
with that turn; a later turn receives the then-current editor content.

**Card attachment**:
A copied attachment containing the learner-visible information from a selected
dictionary word or phrase card.
_Avoid_: Card reference, when implying a live link to the original card.

**Retrieved source context**:
Relevant learner-accessible material the assistant finds within the current
dictionary or text to answer a question. The learner can see which cards or
passages informed the answer; retrieving an excerpt does not imply the whole
source was analyzed.

**Conversation**:
A private, retained discussion associated with a dictionary, text, or knowledge
note, distinct from the notes saved from it. A learner can start another
conversation for the same source; deleting a conversation does not delete its
saved knowledge notes.

**Conversation availability**:
Access to a conversation follows access to its source: archiving or lost shared
access makes it unavailable, restored access makes it available again, and
permanent source deletion deletes associated conversations.

**Conversation source**:
The dictionary, text, or knowledge note from which a conversation is opened,
providing live context and governing conversation availability. Copied
attachments are not additional conversation sources, and saved knowledge notes
do not carry an origin link back to this source.

**Draft source context**:
Unsaved source content explicitly selected by the learner for a conversation
instead of saved content. Conversations and notes derived from it identify that
origin; later source edits do not silently replace the wording being explained.
