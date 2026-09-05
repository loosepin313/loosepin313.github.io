---
layout: default
title: Home
---

<section class="hero">
    <h1><img class="hero-logo" src="/assets/images/loosepin313-64.png" alt="" width="64" height="64"> Hi, I'm Charris.</h1>
    <p class="lede">A Senior DevOps Engineer from downtown Australia who loves Linux and anything technology related.</p>
</section>

<section>
    <h2>About me</h2>
    <p>I'm a builder of all the things. My speciality is Linux but I can be found having to deal with that other OS from time to time. Of late with the rise of the machines I find myself tinkering with running my own local LLM setup and trying to optimise my agent of choice Pi.dev.  I'm also a retro nerd with C64's and too many 386,486 and pentium era machines stacked on my bench to be pulled out and fired up when I feel like a little bit of self indulged hair pulling.</p>
    <p>I also hammer my 3D printer a fair bit and have recently built a few 10' labrax setups. To be honest I have too much shit and I really need to cull it all back a bit.  I'm also a petrol head, love anything with an engine especially rotaries, and a mad keen 4WDer. Camping and 4WDing is a big love.</p>
    <p>When I'm not doing stuff and things for work, you'll find me exploring new tech, spending way too many hours trying to work out how something works.  I would say I have ADHD and probs a bit on the spectrum, when I work out how it works I'm onto the next thing and that can be both good and bad, good as I've learnt something and bad because I usually have many many little unfinished things all hanging around my little den of mess as the wife likes to call my office.</p>
</section>

<section>
    <h2>Recent posts</h2>
    {% if site.posts.size == 0 %}
        <p class="meta">Nothing published yet — check back soon.</p>
    {% endif %}
    {% for post in site.posts limit: 5 %}
        <a class="post-card" href="{{ post.url }}">
            <h3>{{ post.title }}</h3>
            <span class="meta">{{ post.date | date: "%B %-d, %Y" }}</span>
            <p class="excerpt">{{ post.excerpt | strip_html | truncatewords: 35 }}</p>
        </a>
    {% endfor %}
</section>
