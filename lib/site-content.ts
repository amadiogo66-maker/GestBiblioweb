import { BookMarked, ClipboardList, QrCode, Search, UserPlus, Users, type LucideIcon } from 'lucide-react';

export interface ServiceItem {
  icon: LucideIcon;
  title: string;
  description: string;
  details: string;
}

export const SERVICES: ServiceItem[] = [
  {
    icon: BookMarked,
    title: 'Consultation sur place',
    description: 'Un espace de lecture calme et équipé, ouvert à tous les membres de la communauté universitaire.',
    details:
      "Des salles de lecture réparties par département, avec accès Wi-Fi et prises électriques, sont disponibles aux heures d'ouverture pour consulter les ouvrages sans les emprunter.",
  },
  {
    icon: Users,
    title: 'Emprunt',
    description: "Empruntez jusqu'à plusieurs ouvrages à la fois selon votre statut, pour une durée de deux semaines.",
    details:
      'Les étudiants peuvent emprunter jusqu\'à 5 ouvrages simultanément et les enseignants jusqu\'à 10, pour une durée de 14 jours renouvelable deux fois si aucun autre lecteur ne l\'a réservé.',
  },
  {
    icon: ClipboardList,
    title: 'Réinscription',
    description: 'Renouvelez votre inscription chaque année pour continuer à profiter de tous nos services.',
    details:
      'La réinscription se fait en ligne depuis votre profil ou directement au comptoir d\'accueil en début d\'année universitaire, sur présentation de votre carte d\'étudiant ou de votre contrat d\'enseignant.',
  },
  {
    icon: UserPlus,
    title: 'Inscription',
    description: 'Créez votre compte en quelques minutes et obtenez votre carte de bibliothèque numérique.',
    details:
      "Ouverte aux étudiants, enseignants et visiteurs. L'inscription en ligne génère immédiatement une carte de bibliothèque numérique avec QR code, utilisable dès la validation du compte.",
  },
  {
    icon: QrCode,
    title: 'QR Code',
    description: "Présentez votre carte QR pour l'entrée, l'emprunt et le suivi de vos visites à la bibliothèque.",
    details:
      "Chaque carte de bibliothèque intègre un QR code personnel, scanné à l'entrée pour enregistrer votre présence et au comptoir pour accélérer vos emprunts.",
  },
  {
    icon: Search,
    title: 'Recherche documentaire',
    description: 'Retrouvez rapidement un ouvrage grâce à notre moteur de recherche par titre, auteur ou ISBN.',
    details:
      "Le catalogue en ligne permet de filtrer par département, catégorie, année et disponibilité, et d'être averti dès qu'un ouvrage réservé redevient disponible.",
  },
];

export interface OpeningHoursEntry {
  day: string;
  hours: string;
}

export const OPENING_HOURS: OpeningHoursEntry[] = [
  { day: 'Lundi – Vendredi', hours: '8h00 – 20h00' },
  { day: 'Samedi', hours: '9h00 – 17h00' },
  { day: 'Dimanche', hours: 'Fermé' },
];
