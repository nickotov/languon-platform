# Project Languon

Languon - it's a platform that helps to learn foreign languages using AI-first approach and helps tutors to build personalized or general learning courses and lessons for their students.
AI-first approach - means that every user interacts with the platform using AI models and human-like interactions.

## User as a student on platform

Platform provides multiple AI instruments that can work as independent sub-apps and that help to learn foreign language effectively.
Here the list of AI instruments:

1. Translation - allows to translate words/phrases/texts, get definition and context (in original and target languages) + phonetics.
2. Grammar expert - allows to explain grammar rules and provide examples of correct and incorrect usage and save grammar in form the user really understands.
3. Cultural expert - helps to learn culture and understand cultural context.
4. Live language - allows to understand slang and colloquial language, explains idioms and words that are used in real conversations right now

The main and most advanced tool that user can use - the course builder.
Course builder allows to build personalized learning courses and lessons based on the user's preferences and learning goals.
AI agent collects necessary information about the user, the preferences, specificity of user's learning goals, retrictions, educational background and requirements etc.
Based on this information, another AI agent builds the outline of course (topics and verbose descriptions of each topic).
User can adjust the content of the outline and use AI agent to help with it. Once the outline is ready - we save it and generate lessons for the first topic (just outline with verbose descriptions). User can then adjust the content of lessons and use AI tutor agent to help with it.
Once user accepts the the outline of the first lesson - we save it and allow user to start a lesson. User as a student can not generate all lessons and topics immediately - they need to start with the first one and work their way through the course. This is done on purpose to consider user's progress and learning goals.

Tutor agent is the agent that works with the student during the lesson. It should explain the material, answer questions, and provide feedback to the student.
It should consider previous conversations and context to provide the most relevant and helpful responses.

Agent that generates course, lessons, exercises, and other learning content considers users's preferences chat of student with tutor agent to generate the most relevant and helpful content.

To verify the knowledge the most effective way, the exercises should be personalized.

During the lesson user should be able to save words and grammar to workbook and be able to return to it anytime. Agent has full history of conversation, but per lesson user uses new chat (previous answers stay hidden from him, but ai agent knows about it).

Also user should be able to generate exercises based on the workbook content.

## User on platform as tutor

User as tutor can build personalized learning content and exercises for the student.
Tutor can create a workbook (there will be two form of preview - list and canvas).
Tutor has access to the same sub apps as the student, but unlike the student, the result of generation can be embedded into the workbook.
User can add different content to workbook: vocabulary, grammar, exercises, texts/video/audio with questions,etc.
And user can invite student to a dedicated workbook, where student can work on the content independently during his own session.
Tutor can make workbook public so any student can access it and work on the content independently.

## Setup

this is gonna be monorepo with workspaces and turborepo
there will be backend, web, mobile, admin, packages and maybe infra
to build app i want to be able to run infra in docker and other services (backend, web, mobile, admin) without docker or with it, ideally i want to be able to any service in docker
each workspace is gonna have it's own
