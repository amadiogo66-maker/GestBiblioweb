/**
 * Structure officielle de l'Université de Labé — SOURCE DE VÉRITÉ.
 *
 * Les slugs sont ÉCRITS EN DUR : générés une seule fois (minuscules, sans
 * accents, non-alphanumériques → "-"), puis figés. Ne jamais les recalculer
 * depuis le nom affiché : un nom corrigé ne doit pas changer d'identifiant.
 * L'ordre des tableaux donne le sortOrder (à partir de 1).
 * Niveau : "Licence Fondamentale en…" = LICENCE_FONDAMENTALE, "DUT en…" = DUT,
 * sinon LICENCE.
 *
 * Totaux attendus : 4 facultés, 18 départements, 64 programmes.
 */

export type ProgramLevelValue = 'LICENCE' | 'LICENCE_FONDAMENTALE' | 'DUT';

export interface ProgramDefinition {
  slug: string;
  name: string;
  level: ProgramLevelValue;
}

export interface DepartmentDefinition {
  slug: string;
  /** Nom court, sans « Département » ni « de ». */
  name: string;
  programs: readonly ProgramDefinition[];
}

export interface FacultyDefinition {
  slug: string;
  name: string;
  departments: readonly DepartmentDefinition[];
}

export interface DepartmentAliasDefinition {
  /** Valeur DÉJÀ normalisée (voir normalizeDepartmentName dans lib/departments.ts). */
  normalized: string;
  departmentSlug: string;
  note: string;
}

export const UL_STRUCTURE: readonly FacultyDefinition[] = [
  {
    slug: 'faculte-des-sciences-et-techniques',
    name: 'Faculté des Sciences et Techniques',
    departments: [
      {
        slug: 'informatique',
        name: 'Informatique',
        programs: [
          { slug: 'licence-en-transformation-numerique-des-organisations', name: 'Licence en Transformation Numérique des Organisations', level: 'LICENCE' },
          { slug: 'licence-en-intelligence-artificielle-et-systemes-embarques', name: 'Licence en Intelligence Artificielle et Systèmes Embarqués', level: 'LICENCE' },
          { slug: 'licence-en-developpement-d-application', name: 'Licence en Développement d\'Application', level: 'LICENCE' },
          { slug: 'licence-en-reseaux-et-cybersecurite', name: 'Licence en Réseaux et Cybersécurité', level: 'LICENCE' },
          { slug: 'licence-en-infrastructures-et-systemes', name: 'Licence en Infrastructures et Systèmes', level: 'LICENCE' },
          { slug: 'dut-en-reseau-et-developpement-web', name: 'DUT en Réseau et Développement Web', level: 'DUT' },
        ],
      },
      {
        slug: 'biologie',
        name: 'Biologie',
        programs: [
          { slug: 'licence-en-biologie-moleculaire-et-biotechnologies', name: 'Licence en Biologie Moléculaire et Biotechnologies', level: 'LICENCE' },
          { slug: 'licence-en-microbiologie-et-immunologie', name: 'Licence en Microbiologie et Immunologie', level: 'LICENCE' },
          { slug: 'licence-en-biologie-medicale', name: 'Licence en Biologie Médicale', level: 'LICENCE' },
          { slug: 'licence-en-bio-informatique-et-analyse-des-donnees-biologiques', name: 'Licence en Bio-informatique et Analyse des Données Biologiques', level: 'LICENCE' },
          { slug: 'licence-en-parasitologie-et-entomologie', name: 'Licence en Parasitologie et Entomologie', level: 'LICENCE' },
          { slug: 'licence-fondamentale-en-biologie', name: 'Licence Fondamentale en Biologie', level: 'LICENCE_FONDAMENTALE' },
        ],
      },
      {
        slug: 'physique-chimie',
        name: 'Physique-Chimie',
        programs: [
          { slug: 'licence-fondamentale-en-chimie', name: 'Licence Fondamentale en Chimie', level: 'LICENCE_FONDAMENTALE' },
          { slug: 'licence-en-chimie-alimentaire-et-controle-qualite', name: 'Licence en Chimie Alimentaire et Contrôle Qualité', level: 'LICENCE' },
          { slug: 'licence-en-chimie-environnementale', name: 'Licence en Chimie Environnementale', level: 'LICENCE' },
          { slug: 'licence-fondamentale-en-physique', name: 'Licence Fondamentale en Physique', level: 'LICENCE_FONDAMENTALE' },
          { slug: 'licence-en-electronique-et-energetique', name: 'Licence en Électronique et Énergétique', level: 'LICENCE' },
          { slug: 'licence-en-environnement-et-climat', name: 'Licence en Environnement et Climat', level: 'LICENCE' },
          { slug: 'dut-en-energies-renouvelables-et-efficacite-energetique', name: 'DUT en Énergies Renouvelables et Efficacité Énergétique', level: 'DUT' },
        ],
      },
      {
        slug: 'mathematiques',
        name: 'Mathématiques',
        programs: [
          { slug: 'licence-en-mathematiques-fondamentales', name: 'Licence en Mathématiques Fondamentales', level: 'LICENCE' },
          { slug: 'licence-en-mathematiques-intelligence-artificielle-et-analyse-predictive', name: 'Licence en Mathématiques, Intelligence Artificielle et Analyse Prédictive', level: 'LICENCE' },
          { slug: 'licence-en-statistiques-du-developpement', name: 'Licence en Statistiques du Développement', level: 'LICENCE' },
          { slug: 'licence-en-modelisation-mathematique-et-simulation-numerique', name: 'Licence en Modélisation Mathématique et Simulation Numérique', level: 'LICENCE' },
          { slug: 'licence-en-economie-statistique', name: 'Licence en Économie Statistique', level: 'LICENCE' },
        ],
      },
      {
        slug: 'sciences-pour-l-ingenieur',
        name: 'Sciences pour l\'Ingénieur',
        programs: [
          { slug: 'licence-en-energies-renouvelables', name: 'Licence en Énergies Renouvelables', level: 'LICENCE' },
          { slug: 'licence-en-electrotechnique', name: 'Licence en Électrotechnique', level: 'LICENCE' },
          { slug: 'licence-en-informatique-industrielle-et-systemes-embarques', name: 'Licence en Informatique Industrielle et Systèmes Embarqués', level: 'LICENCE' },
        ],
      },
    ],
  },
  {
    slug: 'faculte-des-lettres-et-sciences-humaines',
    name: 'Faculté des Lettres et Sciences Humaines',
    departments: [
      {
        slug: 'anglais',
        name: 'Anglais',
        programs: [
          { slug: 'licence-en-enseignement-de-la-langue-anglaise', name: 'Licence en Enseignement de la Langue Anglaise', level: 'LICENCE' },
          { slug: 'licence-en-traduction-interpretation-et-localisation', name: 'Licence en Traduction, Interprétation et Localisation', level: 'LICENCE' },
          { slug: 'licence-en-business-administration', name: 'Licence en Business Administration', level: 'LICENCE' },
        ],
      },
      {
        slug: 'langue-arabe',
        name: 'Langue Arabe',
        programs: [
          { slug: 'licence-en-enseignement-de-la-langue-arabe', name: 'Licence en Enseignement de la Langue Arabe', level: 'LICENCE' },
          { slug: 'licence-en-traduction-arabe-interpretation-et-mediation-interculturelle', name: 'Licence en Traduction Arabe, Interprétation et Médiation Interculturelle', level: 'LICENCE' },
          { slug: 'licence-en-langue-arabe-appliquee-aux-affaires-et-au-commerce-international', name: 'Licence en Langue Arabe Appliquée aux Affaires et au Commerce International', level: 'LICENCE' },
        ],
      },
      {
        slug: 'lettres-modernes',
        name: 'Lettres Modernes',
        programs: [
          { slug: 'licence-en-litterature-societe-et-communication', name: 'Licence en Littérature, Société et Communication', level: 'LICENCE' },
          { slug: 'licence-en-litterature-et-enseignement', name: 'Licence en Littérature et Enseignement', level: 'LICENCE' },
        ],
      },
      {
        slug: 'sciences-du-langage',
        name: 'Sciences du Langage',
        programs: [
          { slug: 'licence-fondamentale-en-linguistique-generale', name: 'Licence Fondamentale en Linguistique Générale', level: 'LICENCE_FONDAMENTALE' },
          { slug: 'licence-en-linguistique-africaine', name: 'Licence en Linguistique Africaine', level: 'LICENCE' },
          { slug: 'licence-en-langue-et-communication', name: 'Licence en Langue et Communication', level: 'LICENCE' },
        ],
      },
    ],
  },
  {
    slug: 'faculte-des-sciences-sociales',
    name: 'Faculté des Sciences Sociales',
    departments: [
      {
        slug: 'sociologie',
        name: 'Sociologie',
        programs: [
          { slug: 'licence-fondamentale-en-sociologie', name: 'Licence Fondamentale en Sociologie', level: 'LICENCE_FONDAMENTALE' },
          { slug: 'licence-en-management-des-organisations-et-developpement-institutionnel', name: 'Licence en Management des Organisations et Développement Institutionnel', level: 'LICENCE' },
          { slug: 'licence-en-ingenierie-sociale-et-education-au-developpement', name: 'Licence en Ingénierie Sociale et Éducation au Développement', level: 'LICENCE' },
          { slug: 'licence-en-developpement-local-et-gestion-de-projets', name: 'Licence en Développement Local et Gestion de Projets', level: 'LICENCE' },
          { slug: 'licence-en-genre-inclusion-sociale-et-droits-humains', name: 'Licence en Genre, Inclusion Sociale et Droits Humains', level: 'LICENCE' },
          { slug: 'licence-en-socio-anthropologie-de-la-sante', name: 'Licence en Socio-Anthropologie de la Santé', level: 'LICENCE' },
        ],
      },
      {
        slug: 'histoire',
        name: 'Histoire',
        programs: [
          { slug: 'licence-fondamentale-en-histoire', name: 'Licence Fondamentale en Histoire', level: 'LICENCE_FONDAMENTALE' },
          { slug: 'licence-en-diplomatie-et-cooperation-internationale', name: 'Licence en Diplomatie et Coopération Internationale', level: 'LICENCE' },
          { slug: 'licence-en-patrimoine-historique-et-culturel', name: 'Licence en Patrimoine Historique et Culturel', level: 'LICENCE' },
        ],
      },
      {
        slug: 'geographie',
        name: 'Géographie',
        programs: [
          { slug: 'licence-fondamentale-en-geographie', name: 'Licence Fondamentale en Géographie', level: 'LICENCE_FONDAMENTALE' },
          { slug: 'licence-en-planification-territoriale-et-villes-durables', name: 'Licence en Planification Territoriale et Villes Durables', level: 'LICENCE' },
          { slug: 'licence-en-geomatique', name: 'Licence en Géomatique', level: 'LICENCE' },
        ],
      },
    ],
  },
  {
    slug: 'faculte-des-sciences-administratives-juridiques-et-de-gestion',
    name: 'Faculté des Sciences Administratives, Juridiques et de Gestion',
    departments: [
      {
        slug: 'economie-sociale-et-solidaire',
        name: 'Économie Sociale et Solidaire',
        programs: [
          { slug: 'licence-en-economie-sociale-et-solidaire', name: 'Licence en Économie Sociale et Solidaire', level: 'LICENCE' },
        ],
      },
      {
        slug: 'gestion',
        name: 'Gestion',
        programs: [
          { slug: 'licence-en-management-de-projets-et-innovation', name: 'Licence en Management de Projets et Innovation', level: 'LICENCE' },
          { slug: 'licence-fondamentale-en-gestion', name: 'Licence Fondamentale en Gestion', level: 'LICENCE_FONDAMENTALE' },
        ],
      },
      {
        slug: 'administration-publique',
        name: 'Administration Publique',
        programs: [
          { slug: 'licence-en-administration-publique', name: 'Licence en Administration Publique', level: 'LICENCE' },
        ],
      },
      {
        slug: 'economie',
        name: 'Économie',
        programs: [
          { slug: 'licence-en-economie-mathematique', name: 'Licence en Économie-Mathématique', level: 'LICENCE' },
          { slug: 'licence-fondamentale-en-economie', name: 'Licence Fondamentale en Économie', level: 'LICENCE_FONDAMENTALE' },
        ],
      },
      {
        slug: 'droit',
        name: 'Droit',
        programs: [
          { slug: 'licence-fondamentale-en-droit-prive', name: 'Licence Fondamentale en Droit Privé', level: 'LICENCE_FONDAMENTALE' },
          { slug: 'licence-fondamentale-en-droit-public', name: 'Licence Fondamentale en Droit Public', level: 'LICENCE_FONDAMENTALE' },
          { slug: 'licence-en-droit-des-affaires-et-fiscalite', name: 'Licence en Droit des Affaires et Fiscalité', level: 'LICENCE' },
          { slug: 'licence-en-droit-minier-de-l-energie-et-de-l-environnement', name: 'Licence en Droit Minier, de l\'Énergie et de l\'Environnement', level: 'LICENCE' },
        ],
      },
      {
        slug: 'sciences-politiques',
        name: 'Sciences Politiques',
        programs: [
          { slug: 'licence-fondamentale-en-sciences-politiques', name: 'Licence Fondamentale en Sciences Politiques', level: 'LICENCE_FONDAMENTALE' },
          { slug: 'licence-en-administration-et-gouvernance-des-projets-publics', name: 'Licence en Administration et Gouvernance des Projets Publics', level: 'LICENCE' },
          { slug: 'licence-en-diplomatie-et-relations-internationales', name: 'Licence en Diplomatie et Relations Internationales', level: 'LICENCE' },
          { slug: 'licence-en-gouvernance-electorale-et-processus-democratiques', name: 'Licence en Gouvernance Électorale et Processus Démocratiques', level: 'LICENCE' },
        ],
      },
    ],
  },
];

/**
 * Alias validés. N'en ajouter qu'après décision explicite (ex. « Lettres »,
 * « Médecine » restent volontairement non résolus).
 */
export const UL_DEPARTMENT_ALIASES: readonly DepartmentAliasDefinition[] = [
  { normalized: 'physique', departmentSlug: 'physique-chimie', note: 'Ancien libellé du catalogue' },
  { normalized: 'chimie', departmentSlug: 'physique-chimie', note: 'Ancien libellé du catalogue' },
  { normalized: 'maths', departmentSlug: 'mathematiques', note: 'Abréviation' },
  { normalized: 'math', departmentSlug: 'mathematiques', note: 'Abréviation' },
];

export const UL_STRUCTURE_COUNTS = { faculties: 4, departments: 18, programs: 64 } as const;
