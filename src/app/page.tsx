import { listServices } from '@/lib/services/service-registry';
import { LandingHero } from '@/components/landing/landing-hero';

export default async function HomePage() {
  const services = await listServices();

  return (
    <LandingHero
      services={services.map((service) => ({
        id: service.id,
        name: service.name,
        description: service.description ?? '',
        active: service.active,
        slug: service.slug
      }))}
    />
  );
}