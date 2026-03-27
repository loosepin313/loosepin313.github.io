---
layout: default
---
<h1>Welcome to My Personal Website</h1>

<p>This is a simple personal website built with Jekyll.</p>

<p>Feel free to explore my content and get in touch!</p>

<section class="content">
  <h2>Recent Posts</h2>
  {% for post in site.posts limit:5 %}
    <article>
      <h3><a href="{{ post.url }}">{{ post.title }}</a></h3>
      <p class="meta">{{ post.date | date: "%B %d, %Y" }}</p>
      <p>{{ post.excerpt }}</p>
    </article>
  {% endfor %}
</section>