import type { ReactElement } from 'react';
import { HeroSection } from '@/components/home/HeroSection';
import { StatsSection } from '@/components/home/StatsSection';
import { NewBooksSection } from '@/components/home/NewBooksSection';
import { PopularBooksSection } from '@/components/home/PopularBooksSection';
import { ServicesSection } from '@/components/home/ServicesSection';
import { NewsSection } from '@/components/home/NewsSection';
import { getHomeStats, getLatestNews, getNewBooks, getPopularBooks } from '@/lib/home-data';

export const dynamic = 'force-dynamic';

export default async function HomePage(): Promise<ReactElement> {
  const [stats, newBooks, popularBooks, latestNews] = await Promise.all([
    getHomeStats(),
    getNewBooks(6),
    getPopularBooks(6),
    getLatestNews(3),
  ]);

  return (
    <>
      <HeroSection totalBooks={stats.totalBooks} />
      <StatsSection stats={stats} />
      <NewBooksSection books={newBooks} />
      <PopularBooksSection books={popularBooks} />
      <ServicesSection />
      <NewsSection news={latestNews} />
    </>
  );
}
