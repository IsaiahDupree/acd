/**
 * CF-WC-027: Test seed script
 * Idempotent test data seeding for Accounts, Entities, and Relations
 * Covers both PCT and Content Factory test data
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Idempotent seed function that can be run multiple times safely
 */
export async function seedTestData() {
  console.log('🌱 Seeding test data...');

  try {
    // Seed brands (idempotent - check existence first)
    const brandData = [
      {
        id: 'test-brand-1',
        name: 'Test Brand Alpha',
        description: 'First test brand for seeding',
        voice: 'Professional',
        values: 'Quality, Innovation',
        toneStyle: 'Formal',
      },
      {
        id: 'test-brand-2',
        name: 'Test Brand Beta',
        description: 'Second test brand for seeding',
        voice: 'Casual',
        values: 'Fun, Friendly',
        toneStyle: 'Informal',
      },
    ];

    for (const brand of brandData) {
      await prisma.pctBrand.upsert({
        where: { id: brand.id },
        update: brand,
        create: brand,
      });
    }

    console.log(`✅ Seeded ${brandData.length} brands`);

    // Seed products
    const productData = [
      {
        id: 'test-product-1',
        brandId: 'test-brand-1',
        name: 'Test Product A',
        description: 'First test product',
        features: ['Feature 1', 'Feature 2'],
        benefits: ['Benefit 1', 'Benefit 2'],
        targetAudience: 'Young professionals',
        pricePoint: '$99.99',
        category: 'electronics',
      },
      {
        id: 'test-product-2',
        brandId: 'test-brand-1',
        name: 'Test Product B',
        description: 'Second test product',
        features: ['Feature A', 'Feature B'],
        benefits: ['Benefit A', 'Benefit B'],
        targetAudience: 'Families',
        pricePoint: '$149.99',
        category: 'home',
      },
      {
        id: 'test-product-3',
        brandId: 'test-brand-2',
        name: 'Test Product C',
        description: 'Third test product',
        features: ['Cool feature'],
        benefits: ['Amazing benefit'],
        targetAudience: 'Teens',
        pricePoint: '$49.99',
        category: 'lifestyle',
      },
    ];

    for (const product of productData) {
      await prisma.pctProduct.upsert({
        where: { id: product.id },
        update: product,
        create: product,
      });
    }

    console.log(`✅ Seeded ${productData.length} products`);

    // Seed USPs
    const uspData = [
      {
        id: 'test-usp-1',
        productId: 'test-product-1',
        content: 'Impossible to overdo',
        strengthScore: 95,
        isAiGenerated: false,
      },
      {
        id: 'test-usp-2',
        productId: 'test-product-1',
        content: 'Works with shaky hands',
        strengthScore: 88,
        isAiGenerated: false,
      },
      {
        id: 'test-usp-3',
        productId: 'test-product-2',
        content: 'Family-friendly design',
        strengthScore: 92,
        isAiGenerated: false,
      },
    ];

    for (const usp of uspData) {
      await prisma.pctUSP.upsert({
        where: { id: usp.id },
        update: usp,
        create: usp,
      });
    }

    console.log(`✅ Seeded ${uspData.length} USPs`);

    // Seed marketing angles
    const angleData = [
      {
        id: 'test-angle-1',
        uspId: 'test-usp-1',
        content: 'Beautiful even when applied blind',
        category: 'functional',
        isApproved: true,
      },
      {
        id: 'test-angle-2',
        uspId: 'test-usp-1',
        content: 'Never looks overdone',
        category: 'emotional',
        isApproved: true,
      },
      {
        id: 'test-angle-3',
        uspId: 'test-usp-2',
        content: 'Shaky hands, steady glow',
        category: 'functional',
        isApproved: false,
      },
    ];

    for (const angle of angleData) {
      await prisma.pctMarketingAngle.upsert({
        where: { id: angle.id },
        update: angle,
        create: angle,
      });
    }

    console.log(`✅ Seeded ${angleData.length} marketing angles`);

    // Seed hooks
    const hookData = [
      {
        id: 'test-hook-1',
        productId: 'test-product-1',
        uspId: 'test-usp-1',
        marketingAngleId: 'test-angle-1',
        content: 'Gorgeous without even trying',
        messagingFramework: 'punchy',
        awarenessLevel: 3,
        marketSophistication: 2,
        status: 'approved',
        isAiGenerated: false,
      },
      {
        id: 'test-hook-2',
        productId: 'test-product-1',
        uspId: 'test-usp-1',
        marketingAngleId: 'test-angle-1',
        content: 'Even a blindfolded application looks flawless',
        messagingFramework: 'bold_statements',
        awarenessLevel: 4,
        marketSophistication: 3,
        status: 'pending',
        isAiGenerated: true,
      },
      {
        id: 'test-hook-3',
        productId: 'test-product-1',
        uspId: 'test-usp-2',
        marketingAngleId: 'test-angle-3',
        content: 'Trembling hands? Flawless finish.',
        messagingFramework: 'question_based',
        awarenessLevel: 3,
        marketSophistication: 2,
        status: 'approved',
        isAiGenerated: false,
      },
    ];

    for (const hook of hookData) {
      await prisma.pctHook.upsert({
        where: { id: hook.id },
        update: hook,
        create: hook,
      });
    }

    console.log(`✅ Seeded ${hookData.length} hooks`);

    // Seed VoC data
    const vocData = [
      {
        id: 'test-voc-1',
        productId: 'test-product-1',
        content: 'This product changed my life!',
        source: 'Amazon customer review',
        sourceType: 'amazon',
        sentiment: 'positive',
        isGoldNugget: true,
      },
      {
        id: 'test-voc-2',
        productId: 'test-product-1',
        content: 'Finally something that just works',
        source: 'r/ProductReviews',
        sourceType: 'reddit',
        sentiment: 'positive',
        isGoldNugget: false,
      },
    ];

    for (const voc of vocData) {
      await prisma.pctVoiceOfCustomer.upsert({
        where: { id: voc.id },
        update: voc,
        create: voc,
      });
    }

    console.log(`✅ Seeded ${vocData.length} VoC entries`);

    // ===================================
    // CONTENT FACTORY DATA
    // ===================================

    // Seed CF Product Dossiers
    const cfDossierData = [
      {
        id: 'test-cf-dossier-1',
        name: 'Glow Serum Pro',
        slug: 'test-glow-serum-pro',
        tiktokShopUrl: 'https://tiktokshop.test/glow-serum',
        affiliateLink: 'https://affiliate.test/glow-serum?ref=test',
        productPageUrl: 'https://example.com/products/glow-serum',
        price: 49.99,
        discountPrice: 34.99,
        benefits: ['Instant glow', 'Reduces fine lines', 'Works in 30 seconds'],
        painPoints: ['Dull skin', 'Tired appearance', 'Time-consuming routine'],
        proofTypes: ['before-after', 'review', 'demo'],
        targetAudience: 'Women 25-45',
        category: 'beauty',
        niche: 'skincare',
        status: 'active',
      },
      {
        id: 'test-cf-dossier-2',
        name: 'Kitchen Gadget Ultra',
        slug: 'test-kitchen-gadget-ultra',
        tiktokShopUrl: 'https://tiktokshop.test/kitchen-gadget',
        price: 29.99,
        benefits: ['Saves 2 hours daily', 'Easy cleanup', 'Works with any food'],
        painPoints: ['Tedious prep work', 'Hard to clean tools'],
        proofTypes: ['demo', 'comparison'],
        targetAudience: 'Home cooks',
        category: 'kitchen',
        niche: 'gadgets',
        status: 'active',
      },
    ];

    for (const dossier of cfDossierData) {
      await prisma.cfProductDossier.upsert({
        where: { id: dossier.id },
        update: dossier,
        create: dossier,
      });
    }

    console.log(`✅ Seeded ${cfDossierData.length} CF product dossiers`);

    // Seed CF Generated Images
    const cfImageData = [
      {
        id: 'test-cf-image-1',
        dossierId: 'test-cf-dossier-1',
        type: 'before',
        variantNumber: 1,
        prompt: 'Woman with dull, tired skin looking at mirror in morning light',
        model: 'nano-banana',
        imageUrl: 'https://storage.test/cf/before-1.jpg',
        thumbnailUrl: 'https://storage.test/cf/before-1-thumb.jpg',
        status: 'complete',
      },
      {
        id: 'test-cf-image-2',
        dossierId: 'test-cf-dossier-1',
        type: 'after',
        variantNumber: 1,
        prompt: 'Same woman with glowing, radiant skin smiling confidently',
        model: 'nano-banana',
        imageUrl: 'https://storage.test/cf/after-1.jpg',
        thumbnailUrl: 'https://storage.test/cf/after-1-thumb.jpg',
        status: 'complete',
      },
      {
        id: 'test-cf-image-3',
        dossierId: 'test-cf-dossier-1',
        type: 'product',
        variantNumber: 1,
        prompt: 'Glow serum bottle on marble surface with soft lighting',
        model: 'nano-banana',
        imageUrl: 'https://storage.test/cf/product-1.jpg',
        status: 'complete',
      },
    ];

    for (const image of cfImageData) {
      await prisma.cfGeneratedImage.upsert({
        where: { id: image.id },
        update: image,
        create: image,
      });
    }

    console.log(`✅ Seeded ${cfImageData.length} CF generated images`);

    // Seed CF Generated Videos
    const cfVideoData = [
      {
        id: 'test-cf-video-1',
        dossierId: 'test-cf-dossier-1',
        sourceImageId: 'test-cf-image-1',
        type: 'reveal',
        prompt: 'Whip pan transition from before to after',
        model: 'veo-3.1',
        durationSeconds: 8,
        aspectRatio: 'portrait',
        videoUrl: 'https://storage.test/cf/video-1.mp4',
        thumbnailUrl: 'https://storage.test/cf/video-1-thumb.jpg',
        status: 'complete',
      },
      {
        id: 'test-cf-video-2',
        dossierId: 'test-cf-dossier-1',
        sourceImageId: 'test-cf-image-3',
        type: 'demo',
        prompt: 'Product demonstration with smooth camera movement',
        model: 'veo-3.1',
        durationSeconds: 8,
        aspectRatio: 'portrait',
        videoUrl: 'https://storage.test/cf/video-2.mp4',
        status: 'complete',
      },
    ];

    for (const video of cfVideoData) {
      await prisma.cfGeneratedVideo.upsert({
        where: { id: video.id },
        update: video,
        create: video,
      });
    }

    console.log(`✅ Seeded ${cfVideoData.length} CF generated videos`);

    // Seed CF Scripts (5 awareness levels)
    const cfScriptData = [
      {
        id: 'test-cf-script-1',
        dossierId: 'test-cf-dossier-1',
        awarenessLevel: 1,
        marketSophistication: 2,
        hook: 'POV: You wake up looking tired but have coffee with your crush in 20 minutes',
        body: 'Opens drawer. Grabs this. Applies. Suddenly looking alive.',
        cta: 'Link in bio if you need this energy',
        fullScript: 'POV: You wake up looking tired but have coffee with your crush in 20 minutes. Opens drawer. Grabs this. Applies. Suddenly looking alive. Link in bio if you need this energy.',
        wordCount: 31,
        estimatedDurationSeconds: 15,
      },
      {
        id: 'test-cf-script-2',
        dossierId: 'test-cf-dossier-1',
        awarenessLevel: 2,
        marketSophistication: 3,
        hook: 'If you struggle with dull, tired skin every morning, this changed everything',
        body: 'I used to cake on concealer. Now I wake up, apply this serum, and I actually look alive. 30 seconds. That\'s it.',
        cta: 'Try it if dull skin is your problem',
        fullScript: 'If you struggle with dull, tired skin every morning, this changed everything. I used to cake on concealer. Now I wake up, apply this serum, and I actually look alive. 30 seconds. That\'s it. Try it if dull skin is your problem.',
        wordCount: 45,
        estimatedDurationSeconds: 18,
      },
      {
        id: 'test-cf-script-3',
        dossierId: 'test-cf-dossier-1',
        awarenessLevel: 3,
        marketSophistication: 3,
        hook: 'I tried vitamin C, niacinamide, everything',
        body: 'Nothing worked until I found this serum. It works in literal seconds. Not hours. Not days. Seconds.',
        cta: 'See if it works for you',
        fullScript: 'I tried vitamin C, niacinamide, everything. Nothing worked until I found this serum. It works in literal seconds. Not hours. Not days. Seconds. See if it works for you.',
        wordCount: 35,
        estimatedDurationSeconds: 16,
      },
      {
        id: 'test-cf-script-4',
        dossierId: 'test-cf-dossier-1',
        awarenessLevel: 4,
        marketSophistication: 4,
        hook: 'Glow Serum review: Honest thoughts after 30 days',
        body: 'The good: instant glow, works every time. The bad: kind of expensive. The verdict: worth every penny.',
        cta: 'Link in bio for the glow',
        fullScript: 'Glow Serum review: Honest thoughts after 30 days. The good: instant glow, works every time. The bad: kind of expensive. The verdict: worth every penny. Link in bio for the glow.',
        wordCount: 37,
        estimatedDurationSeconds: 17,
      },
      {
        id: 'test-cf-script-5',
        dossierId: 'test-cf-dossier-1',
        awarenessLevel: 5,
        marketSophistication: 5,
        hook: 'This is selling out again',
        body: 'If you want the Glow Serum, grab it now before the price goes back up to $50. It\'s $35 right now.',
        cta: 'Link in bio, don\'t wait',
        fullScript: 'This is selling out again. If you want the Glow Serum, grab it now before the price goes back up to $50. It\'s $35 right now. Link in bio, don\'t wait.',
        wordCount: 35,
        estimatedDurationSeconds: 14,
      },
    ];

    for (const script of cfScriptData) {
      await prisma.cfScript.upsert({
        where: { id: script.id },
        update: script,
        create: script,
      });
    }

    console.log(`✅ Seeded ${cfScriptData.length} CF scripts`);

    // Seed CF Assembled Content
    const cfContentData = [
      {
        id: 'test-cf-content-1',
        dossierId: 'test-cf-dossier-1',
        scriptId: 'test-cf-script-1',
        videoIds: ['test-cf-video-1', 'test-cf-video-2'],
        targetPlatform: 'tiktok',
        caption: 'POV: You wake up looking tired but have coffee with your crush in 20 minutes #glowup #skincare',
        hashtags: ['glowup', 'skincare', 'beautyhack'],
        hasDisclosure: true,
        disclosureType: 'affiliate',
        status: 'ready',
      },
      {
        id: 'test-cf-content-2',
        dossierId: 'test-cf-dossier-1',
        scriptId: 'test-cf-script-2',
        videoIds: ['test-cf-video-1'],
        targetPlatform: 'instagram',
        caption: 'If you struggle with dull, tired skin every morning, this changed everything 🌟',
        hashtags: ['skincare', 'beauty', 'glowingskin'],
        hasDisclosure: false,
        status: 'ready',
      },
    ];

    for (const content of cfContentData) {
      await prisma.cfAssembledContent.upsert({
        where: { id: content.id },
        update: content,
        create: content,
      });
    }

    console.log(`✅ Seeded ${cfContentData.length} CF assembled content pieces`);

    // Seed CF Published Content
    const cfPublishedData = [
      {
        id: 'test-cf-published-1',
        contentId: 'test-cf-content-1',
        platform: 'tiktok',
        platformPostId: 'tt-12345',
        postUrl: 'https://tiktok.com/@test/video/12345',
        promoted: true,
        promoteBudgetCents: 500, // $5.00
        promoteStartAt: new Date('2026-02-28T10:00:00Z'),
        publishedAt: new Date('2026-02-28T10:00:00Z'),
        status: 'promoted',
      },
    ];

    for (const published of cfPublishedData) {
      await prisma.cfPublishedContent.upsert({
        where: { id: published.id },
        update: published,
        create: published,
      });
    }

    console.log(`✅ Seeded ${cfPublishedData.length} CF published content`);

    // Seed CF Angle Tests
    const cfTestData = [
      {
        id: 'test-cf-test-1',
        dossierId: 'test-cf-dossier-1',
        name: 'Awareness Level 1 Test',
        hypothesis: 'POV-style hooks perform better with cold audiences',
        awarenessLevel: 1,
        hookType: 'pov',
        visualStyle: 'before-after',
        budgetPerVariantCents: 500,
        totalBudgetCents: 500,
        variantIds: ['test-cf-published-1'],
        status: 'running',
        startedAt: new Date('2026-02-28T10:00:00Z'),
      },
    ];

    for (const test of cfTestData) {
      await prisma.cfAngleTest.upsert({
        where: { id: test.id },
        update: test,
        create: test,
      });
    }

    console.log(`✅ Seeded ${cfTestData.length} CF angle tests`);

    // Seed CF Performance Metrics
    const cfMetricsData = [
      {
        id: 'test-cf-metric-1',
        publishedId: 'test-cf-published-1',
        date: new Date('2026-02-28'),
        views: 1250,
        likes: 85,
        comments: 12,
        shares: 8,
        saves: 15,
        linkClicks: 42,
        addToCarts: 6,
        purchases: 3,
        purchaseValue: 52.47,
        spendCents: 500, // $5.00
        reach: 980,
        engagementRate: 0.096, // 9.6%
      },
      {
        id: 'test-cf-metric-2',
        publishedId: 'test-cf-published-1',
        date: new Date('2026-03-01'),
        views: 2100,
        likes: 142,
        comments: 18,
        shares: 14,
        saves: 28,
        linkClicks: 67,
        addToCarts: 10,
        purchases: 5,
        purchaseValue: 87.45,
        spendCents: 0, // Organic traffic
        reach: 1850,
        engagementRate: 0.096, // 9.6%
      },
    ];

    for (const metric of cfMetricsData) {
      await prisma.cfPerformanceMetric.upsert({
        where: { id: metric.id },
        update: metric,
        create: metric,
      });
    }

    console.log(`✅ Seeded ${cfMetricsData.length} CF performance metrics`);

    // Seed CF Scoring Config
    const cfScoringData = [
      {
        id: 'test-cf-scoring-1',
        name: 'Default TikTok Scoring',
        holdRateWeight: 0.3,
        watchTimeWeight: 0.25,
        engagementWeight: 0.2,
        clickRateWeight: 0.15,
        conversionWeight: 0.1,
        minViewsForValid: 500,
        minSpendCentsForValid: 300, // $3.00
        isDefault: true,
      },
    ];

    for (const scoring of cfScoringData) {
      await prisma.cfScoringConfig.upsert({
        where: { id: scoring.id },
        update: scoring,
        create: scoring,
      });
    }

    console.log(`✅ Seeded ${cfScoringData.length} CF scoring configs`);

    console.log('✨ Test data seeding complete (PCT + Content Factory)!');
  } catch (error) {
    console.error('❌ Error seeding test data:', error);
    throw error;
  }
}

/**
 * Clean up test data (for teardown)
 */
export async function cleanupTestData() {
  console.log('🧹 Cleaning up test data...');

  try {
    // Delete PCT data in reverse order of dependencies
    await prisma.pctHook.deleteMany({
      where: { id: { startsWith: 'test-' } },
    });

    await prisma.pctMarketingAngle.deleteMany({
      where: { id: { startsWith: 'test-' } },
    });

    await prisma.pctUSP.deleteMany({
      where: { id: { startsWith: 'test-' } },
    });

    await prisma.pctVoiceOfCustomer.deleteMany({
      where: { id: { startsWith: 'test-' } },
    });

    await prisma.pctProduct.deleteMany({
      where: { id: { startsWith: 'test-' } },
    });

    await prisma.pctBrand.deleteMany({
      where: { id: { startsWith: 'test-' } },
    });

    console.log('✅ PCT test data cleaned up');

    // Delete Content Factory data in reverse order of dependencies
    await prisma.cfPerformanceMetric.deleteMany({
      where: { id: { startsWith: 'test-cf-' } },
    });

    await prisma.cfAngleTest.deleteMany({
      where: { id: { startsWith: 'test-cf-' } },
    });

    await prisma.cfPublishedContent.deleteMany({
      where: { id: { startsWith: 'test-cf-' } },
    });

    await prisma.cfAssembledContent.deleteMany({
      where: { id: { startsWith: 'test-cf-' } },
    });

    await prisma.cfScript.deleteMany({
      where: { id: { startsWith: 'test-cf-' } },
    });

    await prisma.cfGeneratedVideo.deleteMany({
      where: { id: { startsWith: 'test-cf-' } },
    });

    await prisma.cfGeneratedImage.deleteMany({
      where: { id: { startsWith: 'test-cf-' } },
    });

    await prisma.cfProductDossier.deleteMany({
      where: { id: { startsWith: 'test-cf-' } },
    });

    await prisma.cfScoringConfig.deleteMany({
      where: { id: { startsWith: 'test-cf-' } },
    });

    console.log('✅ Content Factory test data cleaned up');
    console.log('✅ All test data cleaned up');
  } catch (error) {
    console.error('❌ Error cleaning up test data:', error);
    throw error;
  }
}

// Run seed if executed directly
if (require.main === module) {
  seedTestData()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
