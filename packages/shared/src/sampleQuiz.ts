import type { Quiz } from './types';

/** A built-in quiz so the game is playable before quizzes are stored in a database. */
export const sampleQuiz: Quiz = {
  title: 'The Warm-Up Round',
  questions: [
    {
      text: 'Which planet is known as the Red Planet?',
      options: ['Venus', 'Mars', 'Jupiter', 'Mercury'],
      correctIndex: 1,
      timeLimitSec: 20,
    },
    {
      text: 'In which country would you find the ancient city of Petra?',
      options: ['Egypt', 'Turkey', 'Jordan', 'Greece'],
      correctIndex: 2,
      timeLimitSec: 20,
    },
    {
      text: 'True or false: an octopus has three hearts.',
      options: ['True', 'False'],
      correctIndex: 0,
      timeLimitSec: 15,
    },
    {
      text: 'What is the chemical symbol for gold?',
      options: ['Ag', 'Gd', 'Go', 'Au'],
      correctIndex: 3,
      timeLimitSec: 20,
    },
    {
      text: "Which band released the album 'Abbey Road'?",
      options: ['The Beatles', 'The Rolling Stones', 'Queen', 'The Who'],
      correctIndex: 0,
      timeLimitSec: 20,
    },
    {
      text: 'What is the largest ocean on Earth?',
      options: ['Atlantic', 'Indian', 'Pacific', 'Arctic'],
      correctIndex: 2,
      timeLimitSec: 20,
    },
    {
      text: 'Who painted the Mona Lisa?',
      options: ['Michelangelo', 'Leonardo da Vinci', 'Raphael', 'Botticelli'],
      correctIndex: 1,
      timeLimitSec: 20,
    },
    {
      text: 'How many players does each team have on the pitch in a football (soccer) match?',
      options: ['9', '10', '11', '12'],
      correctIndex: 2,
      timeLimitSec: 20,
    },
  ],
};
